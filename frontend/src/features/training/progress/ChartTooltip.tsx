import { Divider, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { ChartRow } from "./foldProgress";

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

const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;
const CELL = { padding: "1px 0 1px 12px", textAlign: "right", ...TABULAR } as const;

/**
 * The tooltip of a chart: the hovered epoch, one row per series (a dash when the series has no
 * value at that epoch) and, on the loss chart, a grid with every loss component. Names and
 * numbers are rendered as React text only (T-05-06).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  kind,
  series,
  components = [],
  bestEpoch = null,
}: ChartTooltipProps) {
  const { t, i18n } = useTranslation("training");
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (active !== true || row === undefined) {
    return null;
  }
  const formatter = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const format = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : formatter.format(value);
  const epoch = row.epoch ?? label;
  const train = series.find((item) => item.key === "trainLoss");
  const validation = series.find((item) => item.key === "valLoss");

  return (
    <div
      style={{
        background: "var(--mantine-color-dark-8)",
        border: "1px solid var(--mantine-color-dark-4)",
        borderRadius: 4,
        padding: 8,
        fontSize: 12,
        width: "max-content",
      }}
    >
      <Text fz={12} fw={600}>
        {t("charts.tooltip.epoch", { epoch })}
      </Text>
      {bestEpoch !== null && bestEpoch === row.epoch ? (
        <Text fz={12} c="dark.1">
          {t("charts.tooltip.best")}
        </Text>
      ) : null}
      {series.map((item) => (
        <div
          key={item.key}
          data-testid={`tooltip-row-${item.key}`}
          style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}
        >
          <svg width={16} height={2} aria-hidden="true" style={{ flex: "none" }}>
            <line
              x1={0}
              x2={16}
              y1={1}
              y2={1}
              stroke={item.color}
              strokeWidth={2}
              strokeDasharray={item.dashed ? "6 4" : undefined}
            />
          </svg>
          <span style={{ color: "var(--mantine-color-dark-1)" }}>{item.label}</span>
          <span style={{ marginLeft: "auto", paddingLeft: 12, ...TABULAR }}>
            {format(row[item.key])}
          </span>
        </div>
      ))}
      {kind === "loss" && components.length > 0 ? (
        <>
          <Divider my={6} color="dark.4" />
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th />
                <th scope="col" style={{ ...CELL, color: "var(--mantine-color-dark-1)", fontWeight: 400 }}>
                  {train?.label ?? t("charts.legend.train")}
                </th>
                <th scope="col" style={{ ...CELL, color: "var(--mantine-color-dark-1)", fontWeight: 400 }}>
                  {validation?.label ?? t("charts.legend.val")}
                </th>
              </tr>
            </thead>
            <tbody>
              {components.map((name) => (
                <tr key={name}>
                  <th
                    scope="row"
                    style={{
                      padding: "1px 0",
                      textAlign: "left",
                      fontWeight: 400,
                      color: "var(--mantine-color-dark-1)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </th>
                  <td style={CELL}>{format(row.trainParts[name])}</td>
                  <td style={CELL}>{format(row.valParts[name])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
