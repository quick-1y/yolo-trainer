export type SeriesKey = "trainLoss" | "valLoss" | "map50" | "map50_95" | "precision" | "recall";

export interface TooltipSeries {
  key: SeriesKey;
  label: string;
  color: string;
  dashed: boolean;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  label?: string | number;
  kind: "loss" | "map" | "pr";
  series: TooltipSeries[];
  /** Loss component names discovered from the events (`kind="loss"` only). */
  components?: string[];
  /** The best epoch of the run; the tooltip says so when it is hovered (mAP chart only). */
  bestEpoch?: number | null;
}

// Signature stub of the RED commit; the GREEN commit implements it.
export function ChartTooltip(_props: ChartTooltipProps) {
  return null;
}
