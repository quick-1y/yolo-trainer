import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import { type EditorDoc, type EditorStore, createEditorStore } from "./annotationStore";
import { type Saver, createSaver } from "./annotationSaver";

export interface EditorEntry {
  store: EditorStore;
  saver: Saver;
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
 * The retained store + saver of an image, created on first use.
 * `init` and `send` are only used when the entry is created.
 */
export function getEditor(
  key: EditorKey,
  init: EditorInit,
  send: (input: AnnotationSaveInput) => Promise<SaveResult>,
): EditorEntry {
  const id = keyOf(key);
  const existing = entries.get(id);
  if (existing !== undefined) {
    entries.delete(id);
    entries.set(id, existing);
    return existing;
  }

  const store = createEditorStore(init.doc, init.version);
  const saver = createSaver({
    initialVersion: init.version,
    send,
    onStateChange: (saveState) => store.getState().setMeta({ saveState }),
    onSaved: (result: SaveResult) => store.getState().setMeta({ serverVersion: result.version }),
  });
  // Every doc change - a gesture, and later an undo or redo - is saved like any
  // other change (D-10).
  store.subscribe((state, previous) => {
    if (state.doc !== previous.doc) {
      saver.schedule(state.doc);
    }
  });

  const entry: EditorEntry = { store, saver };
  entries.set(id, entry);
  evictIfNeeded();
  return entry;
}

export function peekEditor(key: EditorKey): EditorEntry | undefined {
  return entries.get(keyOf(key));
}

/** Drop every entry (tests, and a later "discard local history" action). */
export function resetEditors(): void {
  for (const entry of entries.values()) {
    entry.saver.dispose();
  }
  entries.clear();
}
