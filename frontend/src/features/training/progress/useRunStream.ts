import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useState } from "react";

import { runStreamUrl, trainingKeys } from "../../../api/training";
import type { RunDetail } from "../../../api/training";
import { foldProgress, initialProgressState } from "./foldProgress";
import type { ProgressFrame, ProgressState } from "./foldProgress";

/**
 * `reconnecting`: the connection broke and the browser retries on its own (with `Last-Event-ID`,
 * so nothing is replayed twice). `unavailable`: the browser gave up; `retry()` opens a new source.
 */
export type StreamConnection = "connecting" | "open" | "reconnecting" | "unavailable" | "ended";

export interface UseRunStreamOptions {
  /** The stream is opened only while this is true (not for a preparing or queued run). */
  enabled: boolean;
  /** Changing it reopens the stream from the start (a resumed run, Plan 05-06). */
  resumeKey: number;
}

type Action = { kind: "reset" } | { kind: "frame"; frame: ProgressFrame };

function reduce(state: ProgressState, action: Action): ProgressState {
  return action.kind === "reset" ? initialProgressState : foldProgress(state, action.frame);
}

function parse(event: Event): unknown {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as unknown;
  } catch {
    return null;
  }
}

/**
 * One `EventSource` per run page: the replay of the run's history and then live frames, folded
 * into chart rows. The source closes on the server's `end` frame (EventSource would otherwise
 * reconnect forever) and when the page unmounts (Pitfall 11).
 */
export function useRunStream(
  projectId: number,
  runId: number,
  { enabled, resumeKey }: UseRunStreamOptions,
): { progress: ProgressState; connection: StreamConnection; retry: () => void } {
  const queryClient = useQueryClient();
  const [progress, dispatch] = useReducer(reduce, initialProgressState);
  const [connection, setConnection] = useState<StreamConnection>("connecting");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    dispatch({ kind: "reset" });
    setConnection("connecting");
    if (!enabled) {
      return;
    }
    const source = new EventSource(runStreamUrl(projectId, runId));

    source.addEventListener("open", () => setConnection("open"));
    source.addEventListener("error", () => {
      // CLOSED: the browser will not retry (a non-200 answer); CONNECTING: it is retrying.
      setConnection(source.readyState === EventSource.CLOSED ? "unavailable" : "reconnecting");
    });
    source.addEventListener("progress", (event) => {
      const frame = parse(event);
      if (frame !== null && typeof frame === "object") {
        dispatch({ kind: "frame", frame: frame as ProgressFrame });
      }
    });
    source.addEventListener("status", (event) => {
      const payload = parse(event);
      if (payload === null || typeof payload !== "object") {
        return;
      }
      queryClient.setQueryData<RunDetail>(trainingKeys.run(projectId, runId), (current) =>
        current === undefined ? current : { ...current, ...(payload as Partial<RunDetail>) },
      );
    });
    source.addEventListener("end", () => {
      source.close();
      setConnection("ended");
      void queryClient.invalidateQueries({ queryKey: trainingKeys.run(projectId, runId) });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.runs(projectId) });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.active() });
    });

    return () => source.close();
  }, [projectId, runId, enabled, resumeKey, attempt, queryClient]);

  return { progress, connection, retry };
}
