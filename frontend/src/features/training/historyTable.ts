import type { RunStatus, RunSummary } from "../../api/training";

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

// Signature stubs for the RED step of Plan 05-08 Task 2: they compile and answer the defaults, so
// the tests fail on the planned assertions. The GREEN commit replaces them.
export const STATUS_ORDER: readonly RunStatus[] = [];
export function parseHistoryParams(_params: URLSearchParams): HistoryState {
  return { sort: "created", dir: "desc", status: "all" };
}
export function historyParams(_state: HistoryState): URLSearchParams {
  return new URLSearchParams("stub=1");
}
export function firstDirection(_sort: HistorySort): HistoryDirection {
  return "asc";
}
export function sortRuns(
  runs: readonly RunSummary[],
  _sort: HistorySort,
  _dir: HistoryDirection,
  _nowMs: number,
): RunSummary[] {
  return [...runs];
}
export function filterRuns(runs: readonly RunSummary[], _status: HistoryStatus): RunSummary[] {
  return [...runs];
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
