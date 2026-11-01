import { Badge, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { QualityLevel, RunDetail } from "../../api/training";

// Verdict colors (UI-SPEC "Color"): the text is always shown next to the badge.
const QUALITY_COLOR: Record<QualityLevel, MantineColor> = {
  excellent: "green",
  good: "teal",
  fair: "yellow",
  poor: "orange",
};

const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;

interface MetricTile {
  key: "precision" | "recall" | "map50" | "map5095";
  value: number | null;
}

interface RunMetricsProps {
  run: RunDetail;
}

/** Four final metrics, the mAP50 verdict and, for segment projects, the mask note. */
export function RunMetrics({ run }: RunMetricsProps) {
  const { t, i18n } = useTranslation("training");
  const format = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const metrics = run.metrics;
  const tiles: MetricTile[] = [
    { key: "precision", value: metrics?.precision ?? null },
    { key: "recall", value: metrics?.recall ?? null },
    { key: "map50", value: metrics?.map50 ?? null },
    { key: "map5095", value: metrics?.map50_95 ?? null },
  ];

  return (
    <Stack gap={16}>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing={16}>
        {tiles.map((tile) => (
          <Paper
            key={tile.key}
            p={16}
            radius={8}
            style={{ background: "var(--mantine-color-dark-7)" }}
          >
            <Text size="xs" c="dark.1">
              {t(`metrics.${tile.key}`)}
            </Text>
            <Text fz={26} fw={600} lh={1.35} style={TABULAR} data-testid={`metric-${tile.key}`}>
              {tile.value === null ? "—" : format.format(tile.value)}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
      {run.quality !== null ? (
        <Group gap={8}>
          <Badge variant="light" size="sm" color={QUALITY_COLOR[run.quality]} fz={12} tt="none">
            {t(`quality.${run.quality}`)}
          </Badge>
          <Text size="xs" c="dark.1">
            {t("quality.basis")}
          </Text>
        </Group>
      ) : null}
      {run.task_type === "segment" ? (
        <Text size="xs" c="dark.1">
          {t("metrics.maskNote")}
        </Text>
      ) : null}
    </Stack>
  );
}
