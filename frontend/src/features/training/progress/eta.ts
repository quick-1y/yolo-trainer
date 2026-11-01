import type { ProgressState } from "./foldProgress";

/** How many of the newest epoch durations the average covers. */
const WINDOW = 5;
/** The ETA is shown to the nearest ten seconds, so it does not flicker between events. */
const ROUND_SECONDS = 10;

/** The fraction of the current epoch that is done, from the newest batch event. */
function currentFraction(progress: ProgressState, completed: number): number {
  const batch = progress.batch;
  if (batch === null || batch.epoch !== completed + 1 || batch.nb <= 0) {
    return 0;
  }
  return Math.min(1, batch.batch / batch.nb);
}

/** Durations of the epochs finished inside the current segment, oldest first. */
function segmentDurations(progress: ProgressState): number[] {
  const durations: number[] = [];
  let previous = progress.segmentStart;
  for (const end of progress.segmentEpochEnds) {
    if (previous !== null && end.time > previous) {
      durations.push(end.time - previous);
    }
    previous = end.time;
  }
  return durations.slice(-WINDOW);
}

/**
 * Seconds left in the whole run, or null while it cannot be told.
 *
 * Only the current training segment counts: the average covers the last (at most five) epoch
 * durations measured from the segment's `train_start`, so the idle time before a resume is never
 * averaged in. It never uses the wall clock or the run's start timestamp (D-09, Pattern 8). Without a finished
 * epoch, the batch fraction of the first epoch gives the epoch cost.
 */
export function estimateRemainingSeconds(progress: ProgressState): number | null {
  const epochs = progress.epochs;
  if (epochs === null || epochs <= 0) {
    return null;
  }
  const last = progress.segmentEpochEnds[progress.segmentEpochEnds.length - 1];
  const completed = last !== undefined ? last.epoch : (progress.resumedFrom ?? 0);
  const fraction = currentFraction(progress, completed);

  const durations = segmentDurations(progress);
  let epochSeconds: number | null = null;
  if (durations.length > 0) {
    epochSeconds = durations.reduce((total, value) => total + value, 0) / durations.length;
  } else if (
    fraction > 0 &&
    progress.batch !== null &&
    progress.batch.time !== null &&
    progress.segmentStart !== null &&
    progress.batch.time > progress.segmentStart
  ) {
    epochSeconds = (progress.batch.time - progress.segmentStart) / fraction;
  }
  if (epochSeconds === null) {
    return null;
  }
  const remaining = Math.max(0, epochs - completed - fraction) * epochSeconds;
  return Math.round(remaining / ROUND_SECONDS) * ROUND_SECONDS;
}
