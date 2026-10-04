import { describe, expect, it } from "vitest";

import type { Box } from "../../../api/annotations";
import { createEditorStore, docFromSet, payloadFromDoc } from "./annotationStore";

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
