import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import type { ApiError } from "../../../api/client";
import { type EditorDoc, type EditorStore, createEditorStore } from "./annotationStore";
import { type Saver, createSaver } from "./annotationSaver";

/** What the open editor page wants to hear from the saver; it registers and clears them. */
export interface EditorHandlers {
  /** The server refused the save as invalid (422): show the message and resync. */
  onRejected?: (error: ApiError) => void;
  /** The server no longer has the image (404). */
  onGone?: () => void;
}

export interface EditorEntry {
  store: EditorStore;
  saver: Saver;
  /** Mutable: an entry outlives the page, so the page registers its callbacks here. */
  handlers: EditorHandlers;
}

export interface EditorKey {
  projectId: number;
  imageId: number;
}

export interface EditorInit {
  doc: EditorDoc;
  version: number;
}

const MAX_ENTRIES = 30;

// Module-level on purpose: entries outlive the route, so undo history survives
// a trip to another image (D-10) and a pending save keeps running after the
// editor unmounts. Map order is recency order (oldest first).
const entries = new Map<string, EditorEntry>();

/**
 * True while any image holds work that is not safely on the server: a pending or in-flight
 * save, a failed one, or a conflict. Entries outlive the editor route, so this also covers
 * an image the user has already left.
 */
export function anyUnsaved(): boolean {
  for (const entry of entries.values()) {
    const { saveState } = entry.store.getState().meta;
    if (entry.saver.isDirty() || saveState === "error" || saveState === "conflict") {
      return true;
    }
  }
  return false;
}

function guardUnload(event: BeforeUnloadEvent): void {
  if (anyUnsaved()) {
    // The browser shows its own prompt; the text cannot be customized (D-11).
    event.preventDefault();
    event.returnValue = "";
  }
}

let guardInstalled = false;

/** Install the tab-close guard once, when the first entry is created. */
function installUnloadGuard(): void {
  if (!guardInstalled && typeof window !== "undefined") {
    window.addEventListener("beforeunload", guardUnload);
    guardInstalled = true;
  }
}

function keyOf(key: EditorKey): string {
  return `${key.projectId}:${key.imageId}`;
}

function evictIfNeeded(): void {
  if (entries.size <= MAX_ENTRIES) {
    return;
  }
  // Only a CLEAN entry may go: an entry with unsaved work is never dropped.
  for (const [id, entry] of entries) {
    if (entries.size <= MAX_ENTRIES) {
      return;
    }
    if (!entry.saver.isDirty()) {
      entry.saver.dispose();
      entries.delete(id);
    }
  }
}

/**
 * A retained entry is out of date when it holds nothing unsaved but the server has moved on
 * (another tab saved, or a class delete bumped the version): its history describes a document
 * that no longer exists, so undoing it would overwrite the newer state (Pitfall 14).
 */
function isStale(entry: EditorEntry, init: EditorInit): boolean {
  const { saveState, serverVersion } = entry.store.getState().meta;
  return saveState === "saved" && !entry.saver.isDirty() && serverVersion !== init.version;
}

/**
 * The retained store + saver of an image, created on first use.
 * `init` and `send` are only used when the entry is created: a retained entry is kept as it is
 * (with its undo history) unless it is clean and the server version differs from `init.version`,
 * in which case it is dropped and rebuilt from `init`. An entry with unsaved, failed or
 * conflicting edits is never replaced here.
 */
export function getEditor(
  key: EditorKey,
  init: EditorInit,
  send: (input: AnnotationSaveInput) => Promise<SaveResult>,
): EditorEntry {
  const id = keyOf(key);
  const existing = entries.get(id);
  if (existing !== undefined) {
    if (!isStale(existing, init)) {
      entries.delete(id);
      entries.set(id, existing);
      return existing;
    }
    existing.saver.dispose();
    entries.delete(id);
  }

  const handlers: EditorHandlers = {};
  const store = createEditorStore(init.doc, init.version);
  const saver = createSaver({
    initialVersion: init.version,
    send,
    onStateChange: (saveState) => store.getState().setMeta({ saveState }),
    onSaved: (result: SaveResult) => store.getState().setMeta({ serverVersion: result.version }),
    onRejected: (error) => handlers.onRejected?.(error),
    onGone: () => handlers.onGone?.(),
  });
  // Every doc change - a gesture, and later an undo or redo - is saved like any
  // other change (D-10).
  store.subscribe((state, previous) => {
    if (state.doc !== previous.doc) {
      saver.schedule(state.doc);
    }
  });

  const entry: EditorEntry = { store, saver, handlers };
  entries.set(id, entry);
  installUnloadGuard();
  evictIfNeeded();
  return entry;
}

/**
 * Drop one image's entry: its saver is disposed and its history and any unsaved work go with it.
 * For a Reload after a conflict, a rejected save or a deleted image - never a silent discard.
 */
export function discardEditor(key: EditorKey): void {
  const id = keyOf(key);
  const entry = entries.get(id);
  if (entry !== undefined) {
    entry.saver.dispose();
    entries.delete(id);
  }
}

export function peekEditor(key: EditorKey): EditorEntry | undefined {
  return entries.get(keyOf(key));
}

/** Drop every entry (tests). */
export function resetEditors(): void {
  for (const entry of entries.values()) {
    entry.saver.dispose();
  }
  entries.clear();
  if (guardInstalled) {
    window.removeEventListener("beforeunload", guardUnload);
    guardInstalled = false;
  }
}
