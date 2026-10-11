import { Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { RunDetail } from "../../api/training";
import type { PrimaryMetrics } from "./progress/foldProgress";
import { RunMetrics } from "./RunMetrics";

interface FinalResultsCardProps {
  run: RunDetail;
  /** The metrics of the final-validation event; null before it arrives. */
  finalMetrics: PrimaryMetrics | null;
}

/**
 * The final validation of best.pt, apart from the status card. A completed run shows the stored
 * metrics with the quality verdict; a run that is still finishing shows the numbers of the
 * final-validation event (no verdict until the run query refreshes). Failed, cancelled and
 * interrupted runs never get one: their stream may hold a final event, but the run has no
 * result (D-04).
 */
export function FinalResultsCard({ run, finalMetrics }: FinalResultsCardProps) {
  const { t } = useTranslation("training");
  let shown: RunDetail | null = null;
  if (run.status === "completed" && run.metrics !== null) {
    shown = run;
  } else if (run.status === "running" && finalMetrics !== null) {
    shown = {
      ...run,
      metrics: {
        precision: finalMetrics.precision ?? null,
        recall: finalMetrics.recall ?? null,
        map50: finalMetrics.map50 ?? null,
        map50_95: finalMetrics.map50_95 ?? null,
      },
      quality: null,
    };
  }
  if (shown === null) {
    return null;
  }

  return (
    <Paper
      p={16}
      radius={8}
      style={{ background: "var(--mantine-color-dark-6)" }}
      data-testid="final-results"
    >
      <Stack gap={16}>
        <Stack gap={4}>
          <Text fz={14} fw={600}>
            {t("finalResults.title")}
          </Text>
          <Text size="xs" c="dark.1">
            {t("finalResults.caption")}
          </Text>
        </Stack>
        <RunMetrics run={shown} />
      </Stack>
    </Paper>
  );
}
