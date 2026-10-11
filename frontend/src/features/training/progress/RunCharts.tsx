import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "./ChartTooltip";
import type { TooltipSeries } from "./ChartTooltip";
import { bestEpoch } from "./foldProgress";
import type { ChartRow, ProgressState } from "./foldProgress";
import type { StreamConnection } from "./useRunStream";

const GRID_QUERY = "(min-width: 1200px)";
const AXIS_COLOR = "var(--mantine-color-dark-4)";
const LABEL_COLOR = "var(--mantine-color-dark-1)";
const RESUME_COLOR = "var(--mantine-color-dark-2)";
const MARKER_COLOR = "var(--mantine-color-dark-0)";
const TICK = { fill: LABEL_COLOR, fontSize: 12, fontFamily: "inherit" } as const;
const DASH = "6 4";
const DOTTED = "2 3";
const PLOT_HEIGHT = 200;
const PANEL_SKELETON_HEIGHT = 308;

/** Five integer ticks from the first epoch to the planned total (fewer when the run is short). */
export function epochTicks(max: number): number[] {
  const span = max - 1;
  const ticks = new Set<number>();
  for (let index = 0; index < 5; index += 1) {
    ticks.add(Math.round(1 + (span * index) / 4));
  }
  return [...ticks];
}

function Swatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width={16} height={2} aria-hidden="true" style={{ display: "block" }}>
      <line x1={0} x2={16} y1={1} y2={1} stroke={color} strokeWidth={2} strokeDasharray={dash} />
    </svg>
  );
}

function LegendItem({ color, dash, label }: { color: string; dash?: string; label: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Swatch color={color} dash={dash} />
      <Text fz={12} c="dark.1">
        {label}
      </Text>
    </Group>
  );
}

interface ChartPanelProps {
  title: string;
  kind: "loss" | "map" | "pr";
  series: TooltipSeries[];
  rows: ChartRow[];
  epochMax: number;
  resumeBoundaries: number[];
  yDomain: [number, number | "auto"];
  yTicks?: number[];
  yTickCount?: number;
  yTickDigits: number;
  format: (value: number | null) => string;
  caption?: string;
  components?: string[];
  /** The best epoch row, marked on the mAP chart only. */
  best?: ChartRow | null;
}

function ChartPanel({
  title,
  kind,
  series,
  rows,
  epochMax,
  resumeBoundaries,
  yDomain,
  yTicks,
  yTickCount,
  yTickDigits,
  format,
  caption,
  components,
  best = null,
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
            <LegendItem
              key={item.key}
              color={item.color}
              dash={item.dashed ? DASH : undefined}
              label={item.label}
            />
          ))}
          {resumeBoundaries.length > 0 ? (
            <LegendItem color={RESUME_COLOR} dash={DOTTED} label={t("charts.legend.resumed")} />
          ) : null}
        </Group>
        <ResponsiveContainer
          width="100%"
          height={PLOT_HEIGHT}
          initialDimension={{ width: 280, height: PLOT_HEIGHT }}
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
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  kind={kind}
                  series={series}
                  components={components}
                  bestEpoch={best?.epoch ?? null}
                />
              )}
            />
            {resumeBoundaries.map((boundary) => (
              <ReferenceLine
                key={boundary}
                x={boundary + 0.5}
                stroke={RESUME_COLOR}
                strokeWidth={1}
                strokeDasharray={DOTTED}
              />
            ))}
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
            {best !== null && best.map50_95 !== null ? (
              <ReferenceDot
                x={best.epoch}
                y={best.map50_95}
                r={5}
                fill="none"
                stroke={MARKER_COLOR}
                strokeWidth={2}
                ifOverflow="visible"
              />
            ) : null}
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
  /** What the event stream is doing; the charts keep their data through every state. */
  connection: StreamConnection;
  /** The run is training right now (a waiting panel shows until the first epoch ends). */
  running: boolean;
  /** The planned total of epochs of the run, when the run row knows it. */
  epochs: number | null;
  /** Opens the event stream again after it was closed for good. */
  onRetry: () => void;
}

/** The chart section of a run: skeletons, the waiting panel, or the three chart panels. */
export function RunCharts({ progress, connection, running, epochs, onRetry }: RunChartsProps) {
  const { t, i18n } = useTranslation(["training", "common"]);
  const wide = useMediaQuery(GRID_QUERY, false, { getInitialValueInEffect: false }) ?? false;
  const formatter = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const format = (value: number | null) => (value === null ? "—" : formatter.format(value));
  const rows = progress.rows;
  const epochMax = Math.max(epochs ?? progress.epochs ?? 0, rows.at(-1)?.epoch ?? 0, 2);
  const best = bestEpoch(rows);

  let note: ReactNode = null;
  if (connection === "reconnecting") {
    note = (
      <Group justify="flex-end" gap={4} wrap="nowrap">
        <Loader size={12} />
        <Text fz={12} c="dark.1">
          {t("training:charts.stream.reconnecting")}
        </Text>
      </Group>
    );
  } else if (connection === "unavailable") {
    note = (
      <Alert color="yellow" variant="light" role="status">
        <Group justify="space-between" align="center" wrap="wrap" gap={8}>
          <Text size="sm">{t("training:charts.stream.unavailable")}</Text>
          <Button variant="subtle" size="compact-sm" onClick={onRetry}>
            {t("common:retry")}
          </Button>
        </Group>
      </Alert>
    );
  }

  let body: ReactNode = null;
  if (rows.length > 0) {
    const common = {
      rows,
      epochMax,
      resumeBoundaries: progress.resumeBoundaries,
      format,
    };
    body = (
      <SimpleGrid cols={wide ? 3 : 1} spacing={16}>
        <ChartPanel
          {...common}
          kind="loss"
          title={t("training:charts.loss.title")}
          caption={t("training:charts.loss.caption")}
          components={progress.lossComponents}
          series={[
            {
              key: "trainLoss",
              label: t("training:charts.legend.train"),
              color: "var(--mantine-color-violet-4)",
              dashed: false,
            },
            {
              key: "valLoss",
              label: t("training:charts.legend.val"),
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
          kind="map"
          title={t("training:charts.map.title")}
          best={best}
          caption={
            best === null
              ? undefined
              : t("training:charts.map.best", { epoch: best.epoch, value: format(best.map50_95) })
          }
          series={[
            {
              key: "map50",
              label: t("training:metrics.map50"),
              color: "var(--mantine-color-lime-4)",
              dashed: false,
            },
            {
              key: "map50_95",
              label: t("training:metrics.map5095"),
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
          kind="pr"
          title={t("training:charts.pr.title")}
          series={[
            {
              key: "precision",
              label: t("training:metrics.precision"),
              color: "var(--mantine-color-indigo-4)",
              dashed: false,
            },
            {
              key: "recall",
              label: t("training:metrics.recall"),
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
  } else if (connection === "connecting") {
    body = (
      <SimpleGrid cols={wide ? 3 : 1} spacing={16}>
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            height={PANEL_SKELETON_HEIGHT}
            radius={8}
            data-testid="chart-skeleton"
          />
        ))}
      </SimpleGrid>
    );
  } else if (running) {
    body = (
      <Paper
        p={16}
        radius={8}
        mih={96}
        style={{
          background: "var(--mantine-color-dark-6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text size="sm" c="dark.1" ta="center">
          {t("training:charts.waiting")}
        </Text>
      </Paper>
    );
  }

  if (note === null && body === null) {
    return null;
  }
  return (
    <Stack gap={8}>
      {note}
      {body}
    </Stack>
  );
}
