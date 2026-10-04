import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import { ApiError } from "../../../api/client";
import { type EditorDoc, type SaveState, payloadFromDoc } from "./annotationStore";

export type FlushOutcome = "saved" | "error" | "conflict";

/**
 * Wait before retry number 1, 2, 3, ... after a transient failure; the last entry repeats
 * (1 s, 2 s, 4 s, 8 s, then every 15 s). Each wait is jittered, so tabs that lost the
 * server together do not retry together.
 */
export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

/** Each backoff wait is the table value times a factor in [1 - JITTER, 1 + JITTER]. */
const JITTER = 0.2;

export interface SaverOptions {
  /** The version the server reported when the image was loaded. */
  initialVersion: number;
  send: (input: AnnotationSaveInput) => Promise<SaveResult>;
  onStateChange: (state: SaveState) => void;
  onSaved?: (result: SaveResult) => void;
  /**
   * The server refused the save as invalid (422 and any other 4xx but 404 and 409). The doc stays
   * pending and nothing is retried: the owner shows the message and resyncs from the server.
   */
  onRejected?: (error: ApiError) => void;
  /** The server no longer has the image (404). The doc stays pending and nothing is retried. */
  onGone?: () => void;
  debounceMs?: number;
  /** In [0, 1); the jitter source (tests pin it). */
  random?: () => number;
  /** Timer functions (tests inject their own). */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Saver {
  /** Record the latest doc and (re)start the debounce. */
  schedule: (doc: EditorDoc) => void;
  /** Send what is pending now; resolves once nothing is pending or a save failed. */
  flush: () => Promise<FlushOutcome>;
  /** True while anything is unsent or in flight. */
  isDirty: () => boolean;
  /** The version the next request will be based on. */
  version: () => number;
  dispose: () => void;
}

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Serial, coalescing, debounced saver for ONE image.
 *
 * At most one request is in flight: two overlapping requests would carry the
 * same base version and 409 each other. Edits made meanwhile are coalesced -
 * after a success the newest doc is sent with the version that success returned.
 *
 * Failures are classified by status:
 * - 409 stops all sending ("conflict"); the owner offers Reload.
 * - 404 ("gone") and any other 4xx ("rejected") report "error", keep the doc pending and do not
 *   retry: the same request would fail the same way. The next `schedule` or `flush` tries again.
 * - a 5xx or a network error reports "error" and retries on the capped, jittered backoff above
 *   until it works (D-11); a retry sends the same doc with the same base version.
 * While a retry is waiting, new edits only update the pending doc: the next attempt carries them,
 * so one image never sends more than one request per backoff window. `flush` skips the wait.
 */
export function createSaver({
  initialVersion,
  send,
  onStateChange,
  onSaved,
  onRejected,
  onGone,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  random = Math.random,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: SaverOptions): Saver {
  let version = initialVersion;
  let latest: EditorDoc | null = null;
  let dirty = false;
  let inFlight: Promise<void> | null = null;
  let timer: unknown = null;
  let retryTimer: unknown = null;
  // Failed attempts in a row; a success starts the backoff over.
  let attempt = 0;
  let state: SaveState = "saved";
  let conflicted = false;
  let disposed = false;

  const report = (next: SaveState) => {
    if (state !== next) {
      state = next;
      onStateChange(next);
    }
  };

  const clearDebounce = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimer(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt += 1;
    const delay = Math.round(base * (1 - JITTER + 2 * JITTER * random()));
    clearRetry();
    retryTimer = setTimer(() => {
      retryTimer = null;
      void run();
    }, delay);
  };

  const loop = async (): Promise<void> => {
    while (dirty && !conflicted && !disposed && latest !== null) {
      const doc = latest;
      dirty = false;
      try {
        const result = await send(payloadFromDoc(doc, version));
        version = result.version;
        attempt = 0;
        onSaved?.(result);
      } catch (error) {
        // Keep the doc pending; a newer schedule() may already have replaced it.
        if (error instanceof ApiError && error.status === 409) {
          conflicted = true;
          report("conflict");
          return;
        }
        dirty = true;
        report("error");
        if (error instanceof ApiError && error.status === 404) {
          onGone?.();
        } else if (error instanceof ApiError && error.status < 500) {
          onRejected?.(error);
        } else if (!disposed) {
          scheduleRetry();
        }
        return;
      }
    }
    if (!dirty && !conflicted) {
      report("saved");
    }
  };

  const run = (): Promise<void> => {
    // Whoever starts a send covers the waiting retry.
    clearRetry();
    if (inFlight === null) {
      inFlight = loop().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  return {
    schedule(doc) {
      if (disposed || conflicted) {
        return;
      }
      latest = doc;
      dirty = true;
      if (retryTimer !== null) {
        // A retry is already waiting and will carry this doc: no extra request, and the
        // indicator keeps saying the last save failed.
        return;
      }
      report("saving");
      clearDebounce();
      timer = setTimer(() => {
        timer = null;
        // A failed request may have queued a retry since this edit: that one sends it.
        if (retryTimer === null) {
          void run();
        }
      }, debounceMs);
    },

    async flush() {
      clearDebounce();
      clearRetry();
      if (conflicted) {
        return "conflict";
      }
      if (inFlight !== null) {
        await inFlight;
      }
      if (dirty && !conflicted) {
        await run();
      }
      if (conflicted) {
        return "conflict";
      }
      return dirty ? "error" : "saved";
    },

    isDirty: () => dirty || inFlight !== null,

    version: () => version,

    dispose() {
      disposed = true;
      clearDebounce();
      clearRetry();
    },
  };
}
