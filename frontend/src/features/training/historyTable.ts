import type { RunSummary } from "../../api/training";

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
