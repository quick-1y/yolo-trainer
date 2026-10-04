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

/** What the top bar shows: reviewed > background > annotated > unannotated. */
export type DocStatus = "reviewed" | "background" | "annotated" | "unannotated";

/**
 * The status of an image's document. Unannotated and background stay apart: only the
 * explicit flag means "no objects", so an unlabeled image is never an empty-label example.
 */
export function docStatus(doc: EditorDoc): DocStatus {
  if (doc.isReviewed) {
    return "reviewed";
  }
  if (doc.isBackground) {
    return "background";
  }
  return doc.boxes.length > 0 ? "annotated" : "unannotated";
}

/** Most boxes one image can hold; mirrors the server's `schemas.MAX_BOXES` (a PUT with more is a 422). */
export const MAX_BOXES = 2000;

export type SaveState = "saved" | "saving" | "error" | "conflict";

/** Never part of history: where the save is, not what the user edited. */
export interface EditorMeta {
  serverVersion: number;
  saveState: SaveState;
}

export interface EditorState {
  doc: EditorDoc;
  meta: EditorMeta;
  /** One gesture = one `set` = one history entry. Refused (no change) at `MAX_BOXES` boxes. */
  createBox: (box: Box) => void;
  /** Replace one box's geometry (a finished move or resize): one `set`, one history entry. */
  updateBox: (id: string, geometry: NormBox) => void;
  /** Remove one box: one `set`, one history entry. An unknown id changes nothing. */
  deleteBox: (id: string) => void;
  /** Change one box's class: one `set`, one history entry. The same class or an unknown id changes nothing. */
  setBoxClass: (id: string, classId: number) => void;
  /**
   * Flip the background flag, allowed only while the image has no boxes (D-14); the same
   * entry clears reviewed (D-15). Otherwise nothing changes.
   */
  toggleBackground: () => void;
  /**
   * Flip the reviewed flag, allowed only while the image has a box or is background
   * (D-13). Otherwise nothing changes.
   */
  toggleReviewed: () => void;
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
          set((state) => {
            if (state.doc.boxes.length >= MAX_BOXES) {
              // The server would refuse the save: the same state, no entry, no save.
              return state;
            }
            return {
              doc: {
                boxes: [...state.doc.boxes, box],
                // Drawing on a background image clears the flag (D-14) and any
                // annotation change demotes a reviewed image (D-15), in the same entry.
                isBackground: false,
                isReviewed: false,
              },
            };
          }),
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
        toggleBackground: () =>
          set((state) => {
            if (state.doc.boxes.length > 0) {
              // Boxes and background exclude each other: the same state, no entry, no save.
              return state;
            }
            return {
              doc: {
                ...state.doc,
                isBackground: !state.doc.isBackground,
                // Any annotation change demotes a reviewed image, in the same entry (D-15).
                isReviewed: false,
              },
            };
          }),
        toggleReviewed: () =>
          set((state) => {
            if (state.doc.boxes.length === 0 && !state.doc.isBackground) {
              // An unannotated image cannot be reviewed: the same state, no entry, no save.
              return state;
            }
            return { doc: { ...state.doc, isReviewed: !state.doc.isReviewed } };
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
