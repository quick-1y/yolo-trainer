import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import { ApiError } from "../../../api/client";
import type { EditorDoc, SaveState } from "./annotationStore";
import { createSaver } from "./annotationSaver";

function doc(count: number): EditorDoc {
  return {
    boxes: Array.from({ length: count }, (_, index) => ({
      id: `id-${index}`,
      class_id: 1,
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.2,
    })),
    isBackground: false,
    isReviewed: false,
  };
}

function result(version: number, count: number): SaveResult {
  return {
    version,
    box_count: count,
    status: "annotated",
    is_background: false,
    is_reviewed: false,
  };
}

interface Deferred {
  input: AnnotationSaveInput;
  resolve: (value: SaveResult) => void;
  reject: (error: unknown) => void;
}

/** A `send` whose requests stay pending until the test settles them. */
function controlledSend() {
  const calls: Deferred[] = [];
  const send = (input: AnnotationSaveInput) =>
    new Promise<SaveResult>((resolve, reject) => {
      calls.push({ input, resolve, reject });
    });
  return { calls, send };
}

describe("createSaver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces: several edits inside the window produce one request with the latest doc", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const saver = createSaver({ initialVersion: 4, send, onStateChange: (s) => states.push(s) });

    saver.schedule(doc(1));
    saver.schedule(doc(2));
    await vi.advanceTimersByTimeAsync(399);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);

    expect(calls).toHaveLength(1);
    expect(calls[0].input.base_version).toBe(4);
    expect(calls[0].input.boxes).toHaveLength(2);
    calls[0].resolve(result(5, 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["saving", "saved"]);
    expect(saver.version()).toBe(5);
    expect(saver.isDirty()).toBe(false);
  });

  it("never overlaps requests: an edit during a request is sent after it with the returned version", async () => {
    const { calls, send } = controlledSend();
    const saver = createSaver({ initialVersion: 0, send, onStateChange: () => {} });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(1);

    saver.schedule(doc(2));
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(1); // the first request is still in flight

    calls[0].resolve(result(1, 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].input.base_version).toBe(1);
    expect(calls[1].input.boxes).toHaveLength(2);
    calls[1].resolve(result(2, 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.isDirty()).toBe(false);
  });

  it("stops sending after a 409 and reports conflict", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const saver = createSaver({ initialVersion: 0, send, onStateChange: (s) => states.push(s) });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    calls[0].reject(new ApiError("These annotations were changed elsewhere.", 409));
    await vi.advanceTimersByTimeAsync(0);

    expect(states.at(-1)).toBe("conflict");
    saver.schedule(doc(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    await expect(saver.flush()).resolves.toBe("conflict");
  });

  it("keeps the doc pending after another failure and sends it again on the next flush", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const saver = createSaver({ initialVersion: 0, send, onStateChange: (s) => states.push(s) });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    calls[0].reject(new ApiError("Service Unavailable", 503));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("error");
    expect(saver.isDirty()).toBe(true);

    const flushed = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].input.base_version).toBe(0);
    calls[1].resolve(result(1, 1));
    await expect(flushed).resolves.toBe("saved");
    expect(states.at(-1)).toBe("saved");
  });

  it("flush sends pending edits immediately, skipping the debounce", async () => {
    const { calls, send } = controlledSend();
    const saver = createSaver({ initialVersion: 0, send, onStateChange: () => {} });

    saver.schedule(doc(1));
    const flushed = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    calls[0].resolve(result(1, 1));

    await expect(flushed).resolves.toBe("saved");
  });
});
