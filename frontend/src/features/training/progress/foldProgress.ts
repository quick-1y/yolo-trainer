/**
 * Pure, framework-free fold of the run's `progress` frames into chart rows. Replay and live
 * frames go through the same reducer, so a reloaded page rebuilds exactly what a page that
 * stayed open shows. Every field of a frame is optional: files written by an older
 * `train_job` stay readable (D-05).
 */

export interface ChartRow {
  epoch: number;
  map50: number | null;
  map50_95: number | null;
  precision: number | null;
  recall: number | null;
}

export interface ProgressState {
  /** One row per finished epoch, sorted by epoch; the final validation is never a row. */
  rows: ChartRow[];
}

/** The headline numbers the server computes in Python (`primary_metrics`). */
export interface PrimaryMetrics {
  precision?: number | null;
  recall?: number | null;
  map50?: number | null;
  map50_95?: number | null;
}

/** The parsed `data` of a `progress` frame: one line of progress.jsonl, enriched. */
export interface ProgressFrame {
  event?: string;
  epoch?: number;
  epochs?: number;
  final_validation?: boolean;
  primary?: PrimaryMetrics;
  [key: string]: unknown;
}

export const initialProgressState: ProgressState = { rows: [] };

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function foldProgress(state: ProgressState, frame: ProgressFrame): ProgressState {
  if (frame.event !== "fit_epoch_end" || frame.final_validation === true) {
    return state;
  }
  const epoch = frame.epoch;
  if (typeof epoch !== "number" || !Number.isInteger(epoch) || epoch < 1) {
    return state;
  }
  const primary = frame.primary ?? {};
  const row: ChartRow = {
    epoch,
    map50: numberOrNull(primary.map50),
    map50_95: numberOrNull(primary.map50_95),
    precision: numberOrNull(primary.precision),
    recall: numberOrNull(primary.recall),
  };
  // Rows are keyed by epoch and the last write wins.
  const rows = state.rows.filter((existing) => existing.epoch !== epoch);
  rows.push(row);
  rows.sort((a, b) => a.epoch - b.epoch);
  return { rows };
}
