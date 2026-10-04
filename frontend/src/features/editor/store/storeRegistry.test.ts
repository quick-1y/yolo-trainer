import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import { ApiError } from "../../../api/client";
import { docFromSet } from "./annotationStore";
import { anyUnsaved, discardEditor, getEditor, peekEditor, resetEditors } from "./storeRegistry";

const KEY = { projectId: 1, imageId: 5 };
const BOX = { id: "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f", class_id: 7, x: 0.1, y: 0.1, w: 0.5, h: 0.5 };

function init(version: number) {
  return {
    doc: docFromSet({
      version,
      is_background: false,
      is_reviewed: false,
      status: "unannotated",
      boxes: [],
    }),
    version,
  };
}

const ok = async (input: AnnotationSaveInput): Promise<SaveResult> => ({
  version: input.base_version + 1,
  box_count: input.boxes.length,
  status: "annotated",
  is_background: false,
  is_reviewed: false,
});

const pastCount = (entry: ReturnType<typeof getEditor>) =>
  entry.store.temporal.getState().pastStates.length;

afterEach(() => {
  vi.useRealTimers();
  resetEditors();
});

describe("getEditor re-entry check (Pitfall 14, D-10)", () => {
  it("returns the retained store with its history when the server version still matches", async () => {
    const first = getEditor(KEY, init(3), ok);
    first.store.getState().createBox(BOX);
    await first.saver.flush();
    expect(first.store.getState().meta.serverVersion).toBe(4);

    const again = getEditor(KEY, init(4), ok);

    expect(again).toBe(first);
    expect(pastCount(again)).toBe(1);
    expect(again.store.getState().doc.boxes).toHaveLength(1);
  });

  it("discards a clean retained entry whose server version moved on and starts from the server's set", async () => {
    const first = getEditor(KEY, init(3), ok);
    first.store.getState().createBox(BOX);
    await first.saver.flush();

    const fresh = getEditor(KEY, init(9), ok);

    expect(fresh).not.toBe(first);
    expect(pastCount(fresh)).toBe(0);
    expect(fresh.store.getState().doc.boxes).toEqual([]);
    expect(fresh.store.getState().meta.serverVersion).toBe(9);
    expect(fresh.saver.version()).toBe(9);
    expect(peekEditor(KEY)).toBe(fresh);
  });

  it("disposes the discarded entry's saver", async () => {
    vi.useFakeTimers();
    const send = vi.fn(ok);
    const first = getEditor(KEY, init(3), send);
    await first.saver.flush();
    expect(send).not.toHaveBeenCalled();

    getEditor(KEY, init(9), send);
    // A late change on the old store must not reach the server.
    first.store.getState().createBox(BOX);
    await vi.advanceTimersByTimeAsync(2000);

    expect(send).not.toHaveBeenCalled();
  });

  it("keeps a retained entry that is dirty, whatever the server version", () => {
    const first = getEditor(KEY, init(3), ok);
    first.store.getState().createBox(BOX);
    expect(first.saver.isDirty()).toBe(true);

    const again = getEditor(KEY, init(9), ok);

    expect(again).toBe(first);
    expect(again.store.getState().doc.boxes).toHaveLength(1);
  });

  it("keeps an entry whose save failed or conflicted: its edits are not on the server", async () => {
    const failing = getEditor(KEY, init(3), async () => {
      throw new ApiError("boom", 500);
    });
    failing.store.getState().createBox(BOX);
    expect(await failing.saver.flush()).toBe("error");
    expect(getEditor(KEY, init(9), ok)).toBe(failing);
    resetEditors();

    const other = { projectId: 1, imageId: 6 };
    const conflicting = getEditor(other, init(3), async () => {
      throw new ApiError("conflict", 409);
    });
    conflicting.store.getState().createBox(BOX);
    expect(await conflicting.saver.flush()).toBe("conflict");
    expect(getEditor(other, init(9), ok)).toBe(conflicting);
  });
});

describe("discardEditor", () => {
  it("removes the entry, disposes its saver and stops counting it as unsaved", async () => {
    vi.useFakeTimers();
    const send = vi.fn(ok);
    const entry = getEditor(KEY, init(3), send);
    entry.store.getState().createBox(BOX);
    expect(anyUnsaved()).toBe(true);

    discardEditor(KEY);
    await vi.advanceTimersByTimeAsync(2000);

    expect(peekEditor(KEY)).toBeUndefined();
    expect(anyUnsaved()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing for an image that has no entry", () => {
    expect(() => discardEditor({ projectId: 1, imageId: 99 })).not.toThrow();
    expect(peekEditor(KEY)).toBeUndefined();
  });

  it("lets the next getEditor build a fresh entry", () => {
    const first = getEditor(KEY, init(3), ok);
    discardEditor(KEY);

    const second = getEditor(KEY, init(3), ok);

    expect(second).not.toBe(first);
  });
});

describe("entry handlers", () => {
  it("calls the registered onRejected with the 422 error and onGone for a 404", async () => {
    const rejection = new ApiError("Unknown class.", 422);
    const rejected = getEditor(KEY, init(3), async () => {
      throw rejection;
    });
    const onRejected = vi.fn();
    rejected.handlers.onRejected = onRejected;
    rejected.store.getState().createBox(BOX);
    await rejected.saver.flush();
    expect(onRejected).toHaveBeenCalledWith(rejection);

    const other = { projectId: 1, imageId: 6 };
    const gone = getEditor(other, init(3), async () => {
      throw new ApiError("Image not found.", 404);
    });
    const onGone = vi.fn();
    gone.handlers.onGone = onGone;
    gone.store.getState().createBox(BOX);
    await gone.saver.flush();
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("does not fail when nobody registered a handler", async () => {
    const entry = getEditor(KEY, init(3), async () => {
      throw new ApiError("Unknown class.", 422);
    });
    entry.store.getState().createBox(BOX);

    await expect(entry.saver.flush()).resolves.toBe("error");
  });

  it("keeps the handlers a page registered when the entry is retained", () => {
    const first = getEditor(KEY, init(3), ok);
    const onRejected = vi.fn();
    first.handlers.onRejected = onRejected;

    expect(getEditor(KEY, init(3), ok).handlers.onRejected).toBe(onRejected);
  });
});
