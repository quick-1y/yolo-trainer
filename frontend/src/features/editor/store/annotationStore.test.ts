import { describe, expect, it, vi } from "vitest";

import type { Box, SaveResult } from "../../../api/annotations";
import { createEditorStore, docFromSet, payloadFromDoc } from "./annotationStore";
import { getEditor, peekEditor, resetEditors } from "./storeRegistry";

const BOX: Box = { id: "a", class_id: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 };

describe("createEditorStore", () => {
  it("records one history entry per gesture and none for meta changes", () => {
    const store = createEditorStore({ boxes: [], isBackground: false, isReviewed: false }, 0);

    store.getState().createBox(BOX);
    store.getState().createBox({ ...BOX, id: "b" });
    store.getState().setMeta({ saveState: "saving" });
    store.getState().setMeta({ serverVersion: 3 });

    expect(store.temporal.getState().pastStates).toHaveLength(2);
    expect(store.getState().meta).toEqual({ serverVersion: 3, saveState: "saving" });
  });

  it("undo restores the doc and keeps the meta", () => {
    const store = createEditorStore({ boxes: [], isBackground: false, isReviewed: false }, 0);
    store.getState().createBox(BOX);
    store.getState().setMeta({ serverVersion: 1 });

    store.temporal.getState().undo();

    expect(store.getState().doc.boxes).toHaveLength(0);
    expect(store.getState().meta.serverVersion).toBe(1);
  });

  it("drawing clears the background and reviewed flags in the same entry", () => {
    const store = createEditorStore({ boxes: [], isBackground: true, isReviewed: true }, 2);

    store.getState().createBox(BOX);

    expect(store.getState().doc).toMatchObject({ isBackground: false, isReviewed: false });
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("caps the history at 100 steps", () => {
    const store = createEditorStore({ boxes: [], isBackground: false, isReviewed: false }, 0);
    for (let index = 0; index < 105; index += 1) {
      store.getState().createBox({ ...BOX, id: `box-${index}` });
    }
    expect(store.temporal.getState().pastStates).toHaveLength(100);
  });
});

describe("updateBox", () => {
  const MOVED = { x: 0.5, y: 0.4, w: 0.3, h: 0.2 };

  function storeWithBox(isReviewed = false) {
    return createEditorStore({ boxes: [BOX], isBackground: false, isReviewed }, 0);
  }

  it("is one history entry per action", () => {
    const store = storeWithBox();
    store.getState().createBox({ ...BOX, id: "b" });
    const before = store.temporal.getState().pastStates.length;

    store.getState().updateBox("a", MOVED);
    expect(store.temporal.getState().pastStates).toHaveLength(before + 1);
    store.getState().updateBox("b", { x: 0.6, y: 0.6, w: 0.1, h: 0.1 });
    expect(store.temporal.getState().pastStates).toHaveLength(before + 2);
  });

  it("replaces only the geometry of that box", () => {
    const store = storeWithBox();
    store.getState().createBox({ ...BOX, id: "b", class_id: 9 });

    store.getState().updateBox("a", MOVED);

    expect(store.getState().doc.boxes).toEqual([
      { id: "a", class_id: 1, ...MOVED },
      { ...BOX, id: "b", class_id: 9 },
    ]);
  });

  it("adds no history entry for a meta change", () => {
    const store = storeWithBox();
    store.getState().updateBox("a", MOVED);
    const before = store.temporal.getState().pastStates.length;

    store.getState().setMeta({ saveState: "saving" });

    expect(store.temporal.getState().pastStates).toHaveLength(before);
  });

  it("demotes a reviewed image in the same entry", () => {
    const store = storeWithBox(true);

    store.getState().updateBox("a", MOVED);

    expect(store.getState().doc.isReviewed).toBe(false);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("undo restores the previous geometry and the reviewed flag", () => {
    const store = storeWithBox(true);
    store.getState().updateBox("a", MOVED);

    store.temporal.getState().undo();

    expect(store.getState().doc.boxes[0]).toEqual(BOX);
    expect(store.getState().doc.isReviewed).toBe(true);
  });

  it("ignores an unknown id and keeps the same doc (no history entry)", () => {
    const store = storeWithBox();
    const doc = store.getState().doc;

    store.getState().updateBox("missing", MOVED);

    expect(store.getState().doc).toBe(doc);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("treats an unchanged geometry as no change (no history entry, still reviewed)", () => {
    const store = storeWithBox(true);
    const doc = store.getState().doc;

    store.getState().updateBox("a", { x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h });

    expect(store.getState().doc).toBe(doc);
    expect(store.getState().doc.isReviewed).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });
});

describe("deleteBox", () => {
  function storeWithBoxes(isReviewed = false) {
    return createEditorStore(
      { boxes: [BOX, { ...BOX, id: "b" }], isBackground: false, isReviewed },
      0,
    );
  }

  it("removes the box in one history entry and demotes a reviewed image", () => {
    const store = storeWithBoxes(true);

    store.getState().deleteBox("a");

    expect(store.getState().doc.boxes.map((box) => box.id)).toEqual(["b"]);
    expect(store.getState().doc.isReviewed).toBe(false);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("keeps the same doc and adds no entry for an unknown id", () => {
    const store = storeWithBoxes(true);
    const doc = store.getState().doc;

    store.getState().deleteBox("missing");

    expect(store.getState().doc).toBe(doc);
    expect(store.getState().doc.isReviewed).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("undo brings the box and the reviewed flag back", () => {
    const store = storeWithBoxes(true);
    store.getState().deleteBox("a");

    store.temporal.getState().undo();

    expect(store.getState().doc.boxes.map((box) => box.id)).toEqual(["a", "b"]);
    expect(store.getState().doc.isReviewed).toBe(true);
  });
});

describe("history", () => {
  const EMPTY = { boxes: [], isBackground: false, isReviewed: false };

  it("steps back through create, move and delete and forward again, in order", () => {
    const store = createEditorStore(EMPTY, 0);
    store.getState().createBox(BOX);
    store.getState().updateBox("a", { x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
    store.getState().deleteBox("a");

    store.temporal.getState().undo();
    expect(store.getState().doc.boxes[0]).toMatchObject({ x: 0.5, y: 0.5 });
    store.temporal.getState().undo();
    expect(store.getState().doc.boxes[0]).toEqual(BOX);
    store.temporal.getState().undo();
    expect(store.getState().doc.boxes).toEqual([]);
    expect(store.temporal.getState().pastStates).toHaveLength(0);

    store.temporal.getState().redo();
    expect(store.getState().doc.boxes[0]).toEqual(BOX);
    store.temporal.getState().redo();
    expect(store.getState().doc.boxes[0]).toMatchObject({ x: 0.5, y: 0.5 });
    store.temporal.getState().redo();
    expect(store.getState().doc.boxes).toEqual([]);
    expect(store.temporal.getState().futureStates).toHaveLength(0);
  });

  it("a new action after an undo empties the redo stack", () => {
    const store = createEditorStore(EMPTY, 0);
    store.getState().createBox(BOX);
    store.getState().createBox({ ...BOX, id: "b" });
    store.temporal.getState().undo();
    expect(store.temporal.getState().futureStates).toHaveLength(1);

    store.getState().createBox({ ...BOX, id: "c" });

    expect(store.temporal.getState().futureStates).toHaveLength(0);
  });

  it("keeps at most 100 steps after 101 creates", () => {
    const store = createEditorStore(EMPTY, 0);
    for (let index = 0; index < 101; index += 1) {
      store.getState().createBox({ ...BOX, id: `box-${index}` });
    }

    expect(store.temporal.getState().pastStates).toHaveLength(100);
  });

  it("survives switching to another image and back in the same tab", () => {
    resetEditors();
    const send = vi.fn(
      async (): Promise<SaveResult> => ({
        version: 1,
        box_count: 1,
        status: "annotated",
        is_background: false,
        is_reviewed: false,
      }),
    );
    const init = { doc: EMPTY, version: 0 };
    const first = getEditor({ projectId: 1, imageId: 1 }, init, send);
    first.store.getState().createBox(BOX);

    getEditor({ projectId: 1, imageId: 2 }, init, send);

    expect(peekEditor({ projectId: 1, imageId: 1 })?.store.temporal.getState().pastStates).toHaveLength(
      1,
    );
    resetEditors();
  });
});

describe("doc <-> payload", () => {
  it("round-trips the API shape", () => {
    const doc = docFromSet({
      version: 4,
      is_background: false,
      is_reviewed: true,
      status: "reviewed",
      boxes: [BOX],
    });
    expect(payloadFromDoc(doc, 4)).toEqual({
      base_version: 4,
      is_background: false,
      is_reviewed: true,
      boxes: [BOX],
    });
  });
});
