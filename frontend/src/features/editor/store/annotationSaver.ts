import type { AnnotationSaveInput, SaveResult } from "../../../api/annotations";
import { ApiError } from "../../../api/client";
import { type EditorDoc, type SaveState, payloadFromDoc } from "./annotationStore";

export type FlushOutcome = "saved" | "error" | "conflict";

export interface SaverOptions {
  /** The version the server reported when the image was loaded. */
  initialVersion: number;
  send: (input: AnnotationSaveInput) => Promise<SaveResult>;
  onStateChange: (state: SaveState) => void;
  onSaved?: (result: SaveResult) => void;
  debounceMs?: number;
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
 * A 409 stops all sending ("conflict"); any other failure keeps the doc pending
 * and reports "error", and the next `schedule` or `flush` sends it again
 * (timed backoff is added by a later plan).
 */
export function createSaver({
  initialVersion,
  send,
  onStateChange,
  onSaved,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: SaverOptions): Saver {
  let version = initialVersion;
  let latest: EditorDoc | null = null;
  let dirty = false;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: SaveState = "saved";
  let conflicted = false;
  let disposed = false;

  const report = (next: SaveState) => {
    if (state !== next) {
      state = next;
      onStateChange(next);
    }
  };

  const loop = async (): Promise<void> => {
    while (dirty && !conflicted && !disposed && latest !== null) {
      const doc = latest;
      dirty = false;
      try {
        const result = await send(payloadFromDoc(doc, version));
        version = result.version;
        onSaved?.(result);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          conflicted = true;
          report("conflict");
          return;
        }
        // Keep the doc pending; a newer schedule() may already have replaced it.
        dirty = true;
        report("error");
        return;
      }
    }
    if (!dirty && !conflicted) {
      report("saved");
    }
  };

  const run = (): Promise<void> => {
    if (inFlight === null) {
      inFlight = loop().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(doc) {
      if (disposed || conflicted) {
        return;
      }
      latest = doc;
      dirty = true;
      report("saving");
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, debounceMs);
    },

    async flush() {
      clearTimer();
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
      clearTimer();
    },
  };
}
