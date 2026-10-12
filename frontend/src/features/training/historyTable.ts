import type { RunStatus, RunSummary } from "../../api/training";
import { runActiveSeconds } from "./progress/duration";

export type HistorySort =
  | "name"
  | "status"
  | "base"
  | "created"
  | "duration"
  | "epochs"
  | "map50"
  | "map5095"
  | "images";
export type HistoryDirection = "asc" | "desc";
export type HistoryStatus = RunStatus | "all";
export interface HistoryState {
  sort: HistorySort;
  dir: HistoryDirection;
  status: HistoryStatus;
}

export const HISTORY_SORTS: readonly HistorySort[] = [
  "name",
  "status",
  "base",
  "created",
  "duration",
  "epochs",
  "map50",
  "map5095",
  "images",
];

/** Every status, in lifecycle order: the options of the status filter. */
export const RUN_STATUSES: readonly RunStatus[] = [
  "preparing",
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
  "cancelled",
];

/** The fixed order of the Status column (not alphabetical): what needs attention comes first. */
export const STATUS_ORDER: readonly RunStatus[] = [
  "running",
  "preparing",
  "queued",
  "interrupted",
  "failed",
  "cancelled",
  "completed",
];

const DEFAULT_STATE: HistoryState = { sort: "created", dir: "desc", status: "all" };

/**
 * The sort, direction and status filter held in the URL (`?sort`, `?dir`, `?status`). Only
 * allow-listed values are accepted: anything else falls back to the default, so a hand-edited or
 * stale URL can never put the table in an undefined state. The values never reach the server.
 */
export function parseHistoryParams(params: URLSearchParams): HistoryState {
  const sort = params.get("sort");
  const dir = params.get("dir");
  const status = params.get("status");
  return {
    sort: HISTORY_SORTS.find((value) => value === sort) ?? DEFAULT_STATE.sort,
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_STATE.dir,
    status: RUN_STATUSES.find((value) => value === status) ?? DEFAULT_STATE.status,
  };
}

/** The URL for a state; every default is omitted, so the default view has a clean URL. */
export function historyParams(state: HistoryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sort !== DEFAULT_STATE.sort) {
    params.set("sort", state.sort);
  }
  if (state.dir !== DEFAULT_STATE.dir) {
    params.set("dir", state.dir);
  }
  if (state.status !== DEFAULT_STATE.status) {
    params.set("status", state.status);
  }
  return params;
}

/** The direction a column is first sorted in: text ascending, numbers and dates best/newest first. */
export function firstDirection(sort: HistorySort): HistoryDirection {
  return sort === "name" || sort === "base" || sort === "status" ? "asc" : "desc";
}

/** The value a column sorts by; null means "missing" and sorts last in both directions. */
function sortValue(run: RunSummary, sort: HistorySort, nowMs: number): number | string | null {
  switch (sort) {
    case "name":
      return run.name;
    case "base":
      return run.base_name;
    case "status":
      return STATUS_ORDER.indexOf(run.status);
    case "created":
      return Date.parse(run.created_at);
    case "duration":
      return runActiveSeconds(run, nowMs);
    case "epochs":
      return run.epoch;
    case "map50":
      return historyMetric(run, "map50").value;
    case "map5095":
      return historyMetric(run, "map50_95").value;
    case "images":
      return run.image_count;
  }
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  }
  return Number(a) - Number(b);
}

/**
 * A sorted copy of `runs`. Missing values are last whichever way the column runs, and equal
 * values keep the newest run (highest id) first. `nowMs` closes the live segment of a running
 * run, so the duration column orders by active time.
 */
export function sortRuns(
  runs: readonly RunSummary[],
  sort: HistorySort,
  dir: HistoryDirection,
  nowMs: number,
): RunSummary[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...runs].sort((a, b) => {
    const left = sortValue(a, sort, nowMs);
    const right = sortValue(b, sort, nowMs);
    if (left === null && right !== null) {
      return 1;
    }
    if (left !== null && right === null) {
      return -1;
    }
    if (left !== null && right !== null) {
      const order = compareValues(left, right);
      if (order !== 0) {
        return sign * order;
      }
    }
    return b.id - a.id;
  });
}

/** The runs with the given status, or all of them for "all". */
export function filterRuns(runs: readonly RunSummary[], status: HistoryStatus): RunSummary[] {
  return status === "all" ? [...runs] : runs.filter((run) => run.status === status);
}

/** The translation function the helpers need; `useTranslation`'s `t` fits. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** `cpu` -> "CPU", a GPU index -> "GPU 0". */
function deviceName(device: string): string {
  return device === "cpu" ? "CPU" : `GPU ${device}`;
}

/** The three parts of the Settings column; "Auto" stands in until the worker resolved the value. */
export function keySettingsParts(
  run: Pick<RunSummary, "settings" | "resolved">,
  t: Translate,
): { imgsz: string; batch: string; device: string } {
  const { settings, resolved } = run;
  const pending = t("training:settings.autoPending");
  const batch =
    settings.batch === -1 ? (resolved !== null ? String(resolved.batch) : pending) : String(settings.batch);
  const device =
    settings.device === "auto"
      ? resolved !== null
        ? deviceName(resolved.device)
        : pending
      : deviceName(settings.device);
  return { imgsz: String(settings.imgsz), batch, device };
}

/** "imgsz · batch · device", for example "640 · 16 · CPU" (D-14). */
export function formatKeySettings(run: Pick<RunSummary, "settings" | "resolved">, t: Translate): string {
  const { imgsz, batch, device } = keySettingsParts(run, t);
  return `${imgsz} · ${batch} · ${device}`;
}

export interface HistoryMetric {
  value: number | null;
  /** True when the value is the last completed epoch's, not a final validation result. */
  lastEpoch: boolean;
}

/**
 * The mAP shown for a run: the final value, else the value of the last completed epoch (flagged
 * `lastEpoch`), else null. The list read model already folds the last epoch's mAP50-95 into
 * `map50_95` when there is no final result, so the final result is known to be absent exactly
 * when the final `map50` is.
 */
export function historyMetric(
  run: Pick<RunSummary, "map50" | "last_map50" | "map50_95" | "last_map50_95">,
  key: "map50" | "map50_95",
): HistoryMetric {
  if (key === "map50") {
    if (run.map50 !== null) {
      return { value: run.map50, lastEpoch: false };
    }
    return { value: run.last_map50, lastEpoch: run.last_map50 !== null };
  }
  if (run.map50_95 === null) {
    return { value: run.last_map50_95, lastEpoch: run.last_map50_95 !== null };
  }
  return { value: run.map50_95, lastEpoch: run.map50 === null };
}
