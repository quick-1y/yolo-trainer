import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import { ApiError } from "../../../api/client";
import type { EditorDoc, SaveState } from "./annotationStore";
import { BACKOFF_MS, createSaver } from "./annotationSaver";

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

describe("createSaver retries (D-11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Fail the newest request and let the saver settle. */
  async function fail(calls: Deferred[], error: unknown) {
    calls.at(-1)?.reject(error);
    await vi.advanceTimersByTimeAsync(0);
  }

  it("has the documented backoff schedule", () => {
    expect([...BACKOFF_MS]).toEqual([1000, 2000, 4000, 8000, 15000]);
  });

  it("retries a 5xx or a network error at 1, 2, 4, 8 and then every 15 seconds", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: (s) => states.push(s),
      random: () => 0.5,
    });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(1);

    const errors = [
      new ApiError("Server error", 500),
      new TypeError("Failed to fetch"),
      new ApiError("Bad gateway", 502),
      new ApiError("Unavailable", 503),
      new ApiError("Server error", 500),
      new ApiError("Server error", 500),
    ];
    for (const [index, delay] of [1000, 2000, 4000, 8000, 15000, 15000].entries()) {
      await fail(calls, errors[index]);
      expect(states.at(-1)).toBe("error");
      expect(saver.isDirty()).toBe(true);
      const sent = calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(calls).toHaveLength(sent);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(sent + 1);
      // Every retry carries the same doc and the same base version.
      expect(calls.at(-1)?.input.base_version).toBe(0);
    }

    calls.at(-1)?.resolve(result(1, 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("saved");
    expect(saver.isDirty()).toBe(false);
    expect(saver.version()).toBe(1);
    // Nothing is left to retry.
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(7);
  });

  it("starts the backoff over after a success", async () => {
    const { calls, send } = controlledSend();
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: () => {},
      random: () => 0.5,
    });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    await fail(calls, new ApiError("x", 500));
    await vi.advanceTimersByTimeAsync(1000);
    await fail(calls, new ApiError("x", 500));
    await vi.advanceTimersByTimeAsync(2000);
    calls.at(-1)?.resolve(result(1, 1));
    await vi.advanceTimersByTimeAsync(0);

    saver.schedule(doc(2));
    await vi.advanceTimersByTimeAsync(400);
    const sent = calls.length;
    await fail(calls, new ApiError("x", 500));
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(sent);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(sent + 1);
  });

  it("jitters each delay within plus or minus 20 percent", async () => {
    for (const [random, expected] of [
      [0, 800],
      [1, 1200],
    ] as const) {
      const { calls, send } = controlledSend();
      const saver = createSaver({
        initialVersion: 0,
        send,
        onStateChange: () => {},
        random: () => random,
      });
      saver.schedule(doc(1));
      await vi.advanceTimersByTimeAsync(400);
      await fail(calls, new ApiError("x", 500));

      await vi.advanceTimersByTimeAsync(expected - 1);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(2);
      saver.dispose();
    }
  });

  it("a 409 reports conflict and leaves no retry timer pending", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const saver = createSaver({ initialVersion: 0, send, onStateChange: (s) => states.push(s) });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    await fail(calls, new ApiError("These annotations were changed elsewhere.", 409));

    expect(states.at(-1)).toBe("conflict");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(1);
  });

  it("a 422 reports the error once, stays in error and does not retry until the next schedule", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const onRejected = vi.fn();
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: (s) => states.push(s),
      onRejected,
    });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    const rejection = new ApiError("Unknown class.", 422);
    await fail(calls, rejection);

    expect(states.at(-1)).toBe("error");
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledWith(rejection);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(1);

    saver.schedule(doc(2));
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(2);
  });

  it("a 404 reports gone once, stays in error and does not retry", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const onGone = vi.fn();
    const onRejected = vi.fn();
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: (s) => states.push(s),
      onGone,
      onRejected,
    });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    await fail(calls, new ApiError("Image not found.", 404));

    expect(states.at(-1)).toBe("error");
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onRejected).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(1);
  });

  it("flush during a backoff wait sends at once and resolves saved", async () => {
    const { calls, send } = controlledSend();
    const states: SaveState[] = [];
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: (s) => states.push(s),
      random: () => 0.5,
    });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    await fail(calls, new ApiError("x", 503));
    expect(calls).toHaveLength(1);

    const flushed = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    calls[1].resolve(result(1, 1));

    await expect(flushed).resolves.toBe("saved");
    expect(states.at(-1)).toBe("saved");
    // The cancelled retry never fires on top of it.
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(2);
  });

  it("keeps at most one request in flight while retrying and flushing", async () => {
    const { calls, send } = controlledSend();
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: () => {},
      random: () => 0.5,
    });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    await fail(calls, new ApiError("x", 500));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2); // the retry is in flight

    const flushed = saver.flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
    calls[1].resolve(result(1, 1));
    await expect(flushed).resolves.toBe("saved");
  });

  it("dispose cancels a pending retry", async () => {
    const { calls, send } = controlledSend();
    const saver = createSaver({ initialVersion: 0, send, onStateChange: () => {} });

    saver.schedule(doc(1));
    await vi.advanceTimersByTimeAsync(400);
    await fail(calls, new ApiError("x", 500));
    saver.dispose();

    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the injected timers", async () => {
    const { calls, send } = controlledSend();
    const handles: Array<{ fn: () => void; ms: number }> = [];
    const cleared: unknown[] = [];
    const saver = createSaver({
      initialVersion: 0,
      send,
      onStateChange: () => {},
      random: () => 0.5,
      setTimer: (fn, ms) => {
        handles.push({ fn, ms });
        return handles.length;
      },
      clearTimer: (handle) => cleared.push(handle),
    });

    saver.schedule(doc(1));
    expect(handles.map((handle) => handle.ms)).toEqual([400]);
    handles[0].fn();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    await fail(calls, new ApiError("x", 500));

    expect(handles.map((handle) => handle.ms)).toEqual([400, 1000]);
    saver.dispose();
    expect(cleared).toContain(2);
  });
});
