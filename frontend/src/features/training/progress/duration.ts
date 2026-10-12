import type { RunSummary } from "../../../api/training";

/** The fields `runActiveSeconds` reads; the summary and the detail of a run both carry them. */
export type RunTiming = Pick<
  RunSummary,
  "status" | "active_seconds" | "segment_started_at" | "resume_count" | "started_at" | "finished_at"
>;

function secondsBetween(fromIso: string, toMs: number): number {
  return Math.max(0, (toMs - new Date(fromIso).getTime()) / 1000);
}

/**
 * How long a run has actually been training, in seconds (D-09), or null for a run that never
 * started.
 *
 * It is the banked `active_seconds` of the finished running segments, plus the live part of the
 * current segment while the run is running. Time spent in the queue, or between a stop and a
 * resume, never counts. A Phase 4 run has no banked time (`active_seconds` 0, never resumed):
 * its duration falls back to finished minus started, the only measure it has.
 */
export function runActiveSeconds(run: RunTiming, nowMs: number): number | null {
  if (run.status === "running" && run.segment_started_at !== null) {
    return run.active_seconds + secondsBetween(run.segment_started_at, nowMs);
  }
  if (
    run.active_seconds === 0 &&
    run.resume_count === 0 &&
    run.started_at !== null &&
    run.finished_at !== null
  ) {
    return secondsBetween(run.started_at, new Date(run.finished_at).getTime());
  }
  if (run.started_at === null) {
    return null;
  }
  return run.active_seconds;
}
