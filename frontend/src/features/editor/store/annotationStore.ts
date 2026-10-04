import { temporal } from "zundo";
import { createStore } from "zustand/vanilla";

import type { AnnotationSaveInput, AnnotationSet, Box } from "../../../api/annotations";
import type { NormBox } from "../lib/geometry";

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
  /** Replace one box's geometry (a finished move or resize): one `set`, one history entry. */
  updateBox: (id: string, geometry: NormBox) => void;
  /** Remove one box: one `set`, one history entry. An unknown id changes nothing. */
  deleteBox: (id: string) => void;
  /** Change one box's class: one `set`, one history entry. The same class or an unknown id changes nothing. */
  setBoxClass: (id: string, classId: number) => void;
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
        updateBox: (id, geometry) =>
          set((state) => {
            const current = state.doc.boxes.find((box) => box.id === id);
            if (
              current === undefined ||
              (current.x === geometry.x &&
                current.y === geometry.y &&
                current.w === geometry.w &&
                current.h === geometry.h)
            ) {
              // Unknown id or nothing moved: the same state means no history entry and no save.
              return state;
            }
            return {
              doc: {
                ...state.doc,
                boxes: state.doc.boxes.map((box) =>
                  box.id === id ? { ...box, ...geometry } : box,
                ),
                // Any annotation change demotes a reviewed image, in the same entry (D-15).
                isReviewed: false,
              },
            };
          }),
        deleteBox: (id) =>
          set((state) => {
            if (!state.doc.boxes.some((box) => box.id === id)) {
              // Unknown id: the same state means no history entry and no save.
              return state;
            }
            return {
              doc: {
                ...state.doc,
                boxes: state.doc.boxes.filter((box) => box.id !== id),
                // Any annotation change demotes a reviewed image, in the same entry (D-15).
                isReviewed: false,
              },
            };
          }),
        setBoxClass: (id, classId) =>
          set((state) => {
            const current = state.doc.boxes.find((box) => box.id === id);
            if (current === undefined || current.class_id === classId) {
              // Unknown id or nothing changes: the same state means no history entry and no save.
              return state;
            }
            return {
              doc: {
                ...state.doc,
                boxes: state.doc.boxes.map((box) =>
                  box.id === id ? { ...box, class_id: classId } : box,
                ),
                // Any annotation change demotes a reviewed image, in the same entry (D-15).
                isReviewed: false,
              },
            };
          }),
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
