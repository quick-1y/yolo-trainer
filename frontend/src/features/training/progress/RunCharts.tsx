import { Group, Paper, SimpleGrid, Stack, Text, VisuallyHidden } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ChartRow, ProgressState } from "./foldProgress";

const GRID_QUERY = "(min-width: 1200px)";
const AXIS_COLOR = "var(--mantine-color-dark-4)";
const LABEL_COLOR = "var(--mantine-color-dark-1)";
const TICK = { fill: LABEL_COLOR, fontSize: 12, fontFamily: "inherit" } as const;
const DASH = "6 4";

type NumericKey = "trainLoss" | "valLoss" | "map50" | "map50_95" | "precision" | "recall";

interface SeriesDef {
  key: NumericKey;
  label: string;
  color: string;
  dashed: boolean;
}

/** Five integer ticks from the first epoch to the planned total (fewer when the run is short). */
export function epochTicks(max: number): number[] {
  const span = max - 1;
  const ticks = new Set<number>();
  for (let index = 0; index < 5; index += 1) {
    ticks.add(Math.round(1 + (span * index) / 4));
  }
  return [...ticks];
}

function Swatch({ color, dashed }: { color: string; dashed: boolean }) {
  return (
    <svg width={16} height={2} aria-hidden="true" style={{ display: "block" }}>
      <line
        x1={0}
        x2={16}
        y1={1}
        y2={1}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? DASH : undefined}
      />
    </svg>
  );
}

function LegendItem({ color, dashed, label }: { color: string; dashed: boolean; label: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Swatch color={color} dashed={dashed} />
      <Text fz={12} c="dark.1">
        {label}
      </Text>
    </Group>
  );
}

interface ChartPanelProps {
  title: string;
  series: SeriesDef[];
  rows: ChartRow[];
  epochMax: number;
  yDomain: [number, number | "auto"];
  yTicks?: number[];
  yTickCount?: number;
  yTickDigits: number;
  format: (value: number | null) => string;
  caption?: string;
}

function ChartPanel({
  title,
  caption,
  series,
  rows,
  epochMax,
  yDomain,
  yTicks,
  yTickCount,
  yTickDigits,
  format,
}: ChartPanelProps) {
  const { t, i18n } = useTranslation("training");
  const last = rows.at(-1);
  const dot = rows.length >= 3 ? false : { r: 3 };
  const tickFormatter = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: yTickDigits }).format(value);

  return (
    <Paper
      p={16}
      radius={8}
      role="group"
      aria-label={title}
      style={{ background: "var(--mantine-color-dark-6)", minWidth: 0 }}
    >
      <Stack gap={8}>
        <Text fz={14} fw={600}>
          {title}
        </Text>
        <Group gap={16} wrap="wrap">
          {series.map((item) => (
            <LegendItem key={item.key} color={item.color} dashed={item.dashed} label={item.label} />
          ))}
        </Group>
        <ResponsiveContainer
          width="100%"
          height={200}
          initialDimension={{ width: 280, height: 200 }}
        >
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={AXIS_COLOR} />
            <XAxis
              type="number"
              dataKey="epoch"
              domain={[1, epochMax]}
              ticks={epochTicks(epochMax)}
              interval={0}
              allowDecimals={false}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: AXIS_COLOR }}
              label={{
                value: t("charts.xAxis"),
                position: "insideBottom",
                offset: -4,
                style: TICK,
              }}
              height={36}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tickCount={yTickCount}
              tickFormatter={tickFormatter}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: AXIS_COLOR }}
              width={40}
            />
            <Tooltip
              isAnimationActive={false}
              formatter={(value) => (typeof value === "number" ? format(value) : "—")}
              labelFormatter={(label) => `${t("charts.xAxis")} ${String(label)}`}
            />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                strokeDasharray={item.dashed ? DASH : undefined}
                dot={dot}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {caption !== undefined ? (
          <Text fz={12} c="dark.1">
            {caption}
          </Text>
        ) : null}
        {last !== undefined ? (
          <VisuallyHidden>
            {t("charts.latest", {
              epoch: last.epoch,
              values: series.map((item) => `${item.label} ${format(last[item.key])}`).join(", "),
            })}
          </VisuallyHidden>
        ) : null}
      </Stack>
    </Paper>
  );
}

interface RunChartsProps {
  progress: ProgressState;
  /** The planned total of epochs of the run, when the run row knows it. */
  epochs: number | null;
}

/** The three chart panels of a run (loss, mAP, precision and recall), fed by the folded frames. */
export function RunCharts({ progress, epochs }: RunChartsProps) {
  const { t, i18n } = useTranslation("training");
  const wide = useMediaQuery(GRID_QUERY, false, { getInitialValueInEffect: false }) ?? false;
  const formatter = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const format = (value: number | null) => (value === null ? "—" : formatter.format(value));
  const rows = progress.rows;
  const epochMax = Math.max(epochs ?? progress.epochs ?? 0, rows.at(-1)?.epoch ?? 0, 2);

  const common = { rows, epochMax, format };
  return (
    <SimpleGrid cols={wide ? 3 : 1} spacing={16}>
      <ChartPanel
        {...common}
        title={t("charts.loss.title")}
        caption={t("charts.loss.caption")}
        series={[
          {
            key: "trainLoss",
            label: t("charts.legend.train"),
            color: "var(--mantine-color-violet-4)",
            dashed: false,
          },
          {
            key: "valLoss",
            label: t("charts.legend.val"),
            color: "var(--mantine-color-pink-4)",
            dashed: true,
          },
        ]}
        yDomain={[0, "auto"]}
        yTickCount={4}
        yTickDigits={2}
      />
      <ChartPanel
        {...common}
        title={t("charts.map.title")}
        series={[
          {
            key: "map50",
            label: t("metrics.map50"),
            color: "var(--mantine-color-lime-4)",
            dashed: false,
          },
          {
            key: "map50_95",
            label: t("metrics.map5095"),
            color: "var(--mantine-color-grape-4)",
            dashed: true,
          },
        ]}
        yDomain={[0, 1]}
        yTicks={[0, 0.5, 1]}
        yTickDigits={1}
      />
      <ChartPanel
        {...common}
        title={t("charts.pr.title")}
        series={[
          {
            key: "precision",
            label: t("metrics.precision"),
            color: "var(--mantine-color-indigo-4)",
            dashed: false,
          },
          {
            key: "recall",
            label: t("metrics.recall"),
            color: "var(--mantine-color-pink-4)",
            dashed: true,
          },
        ]}
        yDomain={[0, 1]}
        yTicks={[0, 0.5, 1]}
        yTickDigits={1}
      />
    </SimpleGrid>
  );
}
