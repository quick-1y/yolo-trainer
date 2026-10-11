import { Paper, Stack, Text, VisuallyHidden } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ProgressState } from "./foldProgress";

const MAP50_COLOR = "var(--mantine-color-lime-4)";
const MAP50_95_COLOR = "var(--mantine-color-grape-4)";
const AXIS_COLOR = "var(--mantine-color-dark-4)";
const TICK = { fill: "var(--mantine-color-dark-1)", fontSize: 12 } as const;

/** Chart panels of a run, fed by the folded `progress` frames. */
export function RunCharts({ progress }: { progress: ProgressState }) {
  const { t, i18n } = useTranslation("training");
  const formatter = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const format = (value: number | null) => (value === null ? "—" : formatter.format(value));
  const last = progress.rows.at(-1);
  const title = t("charts.map.title");

  return (
    <Paper
      p={16}
      radius={8}
      role="group"
      aria-label={title}
      style={{ background: "var(--mantine-color-dark-6)" }}
    >
      <Stack gap={8}>
        <Text fz={14} fw={600}>
          {title}
        </Text>
        <ResponsiveContainer
          width="100%"
          height={200}
          initialDimension={{ width: 280, height: 200 }}
        >
          <LineChart data={progress.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={AXIS_COLOR} />
            <XAxis
              type="number"
              dataKey="epoch"
              domain={[1, (dataMax: number) => Math.max(dataMax, 2)]}
              allowDecimals={false}
              tickCount={5}
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
              domain={[0, 1]}
              ticks={[0, 0.5, 1]}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: AXIS_COLOR }}
              width={36}
            />
            <Tooltip
              isAnimationActive={false}
              formatter={(value) => (typeof value === "number" ? format(value) : "—")}
              labelFormatter={(label) => `${t("charts.xAxis")} ${String(label)}`}
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="map50"
              name={t("metrics.map50")}
              stroke={MAP50_COLOR}
              strokeWidth={2}
              dot={progress.rows.length < 3 ? { r: 3 } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="map50_95"
              name={t("metrics.map5095")}
              stroke={MAP50_95_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={progress.rows.length < 3 ? { r: 3 } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        {last !== undefined ? (
          <VisuallyHidden>
            {t("charts.latest", {
              epoch: last.epoch,
              values: `${t("metrics.map50")} ${format(last.map50)}, ${t("metrics.map5095")} ${format(last.map50_95)}`,
            })}
          </VisuallyHidden>
        ) : null}
      </Stack>
    </Paper>
  );
}
