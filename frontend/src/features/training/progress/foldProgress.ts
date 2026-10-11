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
  /** Sum of every train loss component present, null when there is none. */
  trainLoss: number | null;
  /** Sum of every validation loss component present, null when there is none. */
  valLoss: number | null;
  /** Train loss components by display name (`box`, `cls`, ...). */
  trainParts: Record<string, number>;
  /** Validation loss components by display name. */
  valParts: Record<string, number>;
  /** The fitness Ultralytics emitted for the epoch (best-epoch selection). */
  fitness: number | null;
}

/** The headline numbers the server computes in Python (`primary_metrics`). */
export interface PrimaryMetrics {
  precision?: number | null;
  recall?: number | null;
  map50?: number | null;
  map50_95?: number | null;
}

/** The latest in-epoch progress: the batch counter of one epoch and when it was reported. */
export interface BatchState {
  epoch: number;
  batch: number;
  nb: number;
  /** Event time, seconds since the Unix epoch; null when the frame carried none. */
  time: number | null;
}

export interface SegmentEpochEnd {
  epoch: number;
  time: number;
}

export type RunPhase = "training" | "final_validation";

export interface ProgressState {
  /** One row per finished epoch, sorted by epoch; the final validation is never a row. */
  rows: ChartRow[];
  /** Loss component names, discovered from the events in first-seen order. */
  lossComponents: string[];
  /** `start_epoch` of every resume, deduplicated. */
  resumeBoundaries: number[];
  /** The primary metrics of the final validation of the best checkpoint. */
  finalMetrics: PrimaryMetrics | null;
  /** The latest planned total of epochs seen in the events. */
  epochs: number | null;
  /** `final_validation` from the last real epoch (or a legacy run at its last epoch) onward. */
  phase: RunPhase;
  /** The newest `batch_progress` of the current segment; null before the first one. */
  batch: BatchState | null;
  /** Event time of the current segment's `train_start` (seconds), null when unknown. */
  segmentStart: number | null;
  /** The epochs finished inside the current segment, in order, with their event times. */
  segmentEpochEnds: SegmentEpochEnd[];
  /** `start_epoch` of the current segment when it is a resume, else null. */
  resumedFrom: number | null;
}

/** The parsed `data` of a `progress` frame: one line of progress.jsonl, enriched. */
export interface ProgressFrame {
  event?: string;
  epoch?: number;
  epochs?: number;
  final_validation?: boolean;
  last_epoch?: boolean;
  /** Schema version; absent on files written before Phase 5. */
  v?: number;
  /** Event time in seconds since the Unix epoch. */
  time?: number;
  batch?: number;
  nb?: number;
  start_epoch?: number;
  resumed?: boolean;
  fitness?: number;
  tloss?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  primary?: PrimaryMetrics;
  [key: string]: unknown;
}

export const initialProgressState: ProgressState = {
  rows: [],
  lossComponents: [],
  resumeBoundaries: [],
  finalMetrics: null,
  epochs: null,
  phase: "training",
  batch: null,
  segmentStart: null,
  segmentEpochEnds: [],
  resumedFrom: null,
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validEpoch(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** `box_loss` -> `box`, `val/box_loss` -> `box`: the display name of a loss component. */
function componentName(key: string): string {
  const name = key.startsWith("val/") ? key.slice("val/".length) : key;
  return name.endsWith("_loss") ? name.slice(0, -"_loss".length) : name;
}

function parts(source: unknown, prefix: string | null): Record<string, number> {
  const result: Record<string, number> = {};
  if (source === null || typeof source !== "object") {
    return result;
  }
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const finite = numberOrNull(value);
    if (finite === null || (prefix !== null && !key.startsWith(prefix))) {
      continue;
    }
    result[componentName(key)] = finite;
  }
  return result;
}

function sum(values: Record<string, number>): number | null {
  const all = Object.values(values);
  return all.length === 0 ? null : all.reduce((total, value) => total + value, 0);
}

function emptyRow(epoch: number): ChartRow {
  return {
    epoch,
    map50: null,
    map50_95: null,
    precision: null,
    recall: null,
    trainLoss: null,
    valLoss: null,
    trainParts: {},
    valParts: {},
    fitness: null,
  };
}

function withComponents(known: string[], ...groups: Record<string, number>[]): string[] {
  const result = [...known];
  for (const group of groups) {
    for (const name of Object.keys(group)) {
      if (!result.includes(name)) {
        result.push(name);
      }
    }
  }
  return result;
}

/** Rows are keyed by epoch and the last write wins; fields the frame does not carry are kept. */
function upsert(rows: ChartRow[], epoch: number, update: (row: ChartRow) => ChartRow): ChartRow[] {
  const existing = rows.find((candidate) => candidate.epoch === epoch) ?? emptyRow(epoch);
  const next = rows.filter((candidate) => candidate.epoch !== epoch);
  next.push(update(existing));
  next.sort((a, b) => a.epoch - b.epoch);
  return next;
}

function plannedEpochs(state: ProgressState, frame: ProgressFrame): number | null {
  const planned = numberOrNull(frame.epochs);
  return planned !== null && planned > 0 ? planned : state.epochs;
}

export function foldProgress(state: ProgressState, frame: ProgressFrame): ProgressState {
  const epochs = plannedEpochs(state, frame);

  if (frame.event === "train_start") {
    const start = numberOrNull(frame.start_epoch);
    // Every train_start opens a new segment: the batch bar, the ETA window and the phase restart.
    const segment = {
      phase: "training" as const,
      batch: null,
      segmentStart: numberOrNull(frame.time),
      segmentEpochEnds: [],
    };
    if (start === null) {
      return { ...state, ...segment, resumedFrom: null, epochs };
    }
    // Rows above the checkpoint epoch belong to an interrupted attempt; the resume redoes them.
    const resumed = frame.resumed === true;
    const resumeBoundaries =
      resumed && !state.resumeBoundaries.includes(start)
        ? [...state.resumeBoundaries, start].sort((a, b) => a - b)
        : state.resumeBoundaries;
    return {
      ...state,
      ...segment,
      rows: state.rows.filter((row) => row.epoch <= start),
      resumeBoundaries,
      resumedFrom: resumed ? start : null,
      epochs,
    };
  }

  if (frame.event === "batch_progress") {
    const { epoch, batch, nb } = frame;
    if (!validEpoch(epoch) || !validEpoch(batch) || !validEpoch(nb)) {
      return epochs === state.epochs ? state : { ...state, epochs };
    }
    // Only the newest report counts; a new epoch number replaces it, so the bar restarts at 0.
    return { ...state, batch: { epoch, batch, nb, time: numberOrNull(frame.time) }, epochs };
  }

  if (frame.event === "train_epoch_end" && validEpoch(frame.epoch)) {
    const trainParts = parts(frame.tloss, null);
    const epoch = frame.epoch;
    const time = numberOrNull(frame.time);
    return {
      ...state,
      segmentEpochEnds:
        time === null
          ? state.segmentEpochEnds
          : [...state.segmentEpochEnds.filter((end) => end.epoch !== epoch), { epoch, time }],
      rows: upsert(state.rows, frame.epoch, (row) => ({
        ...row,
        trainParts,
        trainLoss: sum(trainParts),
      })),
      lossComponents: withComponents(state.lossComponents, trainParts),
      epochs,
    };
  }

  if (frame.event === "fit_epoch_end") {
    const primary = frame.primary ?? {};
    if (frame.final_validation === true) {
      return {
        ...state,
        finalMetrics: {
          precision: numberOrNull(primary.precision),
          recall: numberOrNull(primary.recall),
          map50: numberOrNull(primary.map50),
          map50_95: numberOrNull(primary.map50_95),
        },
        epochs,
      };
    }
    if (!validEpoch(frame.epoch)) {
      return state;
    }
    const valParts = parts(frame.metrics, "val/");
    return {
      ...state,
      rows: upsert(state.rows, frame.epoch, (row) => ({
        ...row,
        valParts,
        valLoss: sum(valParts),
        map50: numberOrNull(primary.map50),
        map50_95: numberOrNull(primary.map50_95),
        precision: numberOrNull(primary.precision),
        recall: numberOrNull(primary.recall),
        fitness: numberOrNull(frame.fitness),
      })),
      lossComponents: withComponents(state.lossComponents, valParts),
      epochs,
    };
  }

  // batch_progress and every unknown event never touch the chart rows (D-03).
  return epochs === state.epochs ? state : { ...state, epochs };
}

/**
 * The best epoch: the highest emitted `fitness` (ties go to the later epoch); without any
 * fitness, the highest mAP50-95; null when no row has either.
 */
export function bestEpoch(rows: ChartRow[]): ChartRow | null {
  const pick = (value: (row: ChartRow) => number | null): ChartRow | null => {
    let best: ChartRow | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const current = value(row);
      if (current !== null && current >= bestValue) {
        best = row;
        bestValue = current;
      }
    }
    return best;
  };
  return pick((row) => row.fitness) ?? pick((row) => row.map50_95);
}
