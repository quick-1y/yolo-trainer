import { temporal } from "zundo";
import { createStore } from "zustand/vanilla";

import type { AnnotationSaveInput, AnnotationSet, Box } from "../../../api/annotations";

/** The part of an image's annotation state that history tracks and the server stores. */
export interface EditorDoc {
  boxes: Box[];
  isBackground: boolean;
  isReviewed: boolean;
}

export type SaveState = "saved" | "saving" | "error" | "conflict";

/** Never part of history: where the save is, not what the user edited. */
export interface EditorMeta {
  serverVersion: number;
  saveState: SaveState;
}

export interface EditorState {
  doc: EditorDoc;
  meta: EditorMeta;
  /** One gesture = one `set` = one history entry. */
  createBox: (box: Box) => void;
  /** Touches only `meta`; creates no history entry. */
  setMeta: (partial: Partial<EditorMeta>) => void;
}

/**
 * One store per image (zustand vanilla + zundo `temporal`): `doc` is tracked
 * (about 100 steps, D-10), `meta` is not. Without the custom `equality` a
 * metadata-only `set` would still add a history entry, because zundo compares
 * the partialized state by reference of the whole object.
 */
export function createEditorStore(doc: EditorDoc, version: number) {
  return createStore<EditorState>()(
    temporal(
      (set) => ({
        doc,
        meta: { serverVersion: version, saveState: "saved" },
        createBox: (box) =>
          set((state) => ({
            doc: {
              boxes: [...state.doc.boxes, box],
              // Drawing on a background image clears the flag (D-14) and any
              // annotation change demotes a reviewed image (D-15), in the same entry.
              isBackground: false,
              isReviewed: false,
            },
          })),
        setMeta: (partial) => set((state) => ({ meta: { ...state.meta, ...partial } })),
      }),
      {
        partialize: (state) => ({ doc: state.doc }),
        limit: 100,
        equality: (past, current) => past.doc === current.doc,
      },
    ),
  );
}

export type EditorStore = ReturnType<typeof createEditorStore>;

/** API shape to store shape. */
export function docFromSet(set: AnnotationSet): EditorDoc {
  return {
    boxes: set.boxes.map((box) => ({ ...box })),
    isBackground: set.is_background,
    isReviewed: set.is_reviewed,
  };
}

/** Store shape to the PUT body (the box fields keep the API's `class_id`). */
export function payloadFromDoc(doc: EditorDoc, baseVersion: number): AnnotationSaveInput {
  return {
    base_version: baseVersion,
    is_background: doc.isBackground,
    is_reviewed: doc.isReviewed,
    boxes: doc.boxes,
  };
}
