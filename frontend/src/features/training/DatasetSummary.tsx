import { Alert, Anchor, Button, Divider, Paper, Skeleton, Stack, Text } from "@mantine/core";
import type { CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { DatasetSummary as DatasetSummaryData } from "../../api/training";

const SPLITS = ["train", "valid", "test"] as const;
const SKELETON_ROWS = 5;
const ROW_HEIGHT = 32;
const NO_VALUE = "—";

const ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 80px 96px",
  alignItems: "center",
  height: ROW_HEIGHT,
  columnGap: 8,
};

const NUMBER_STYLE: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

interface DatasetSummaryProps {
  projectId: number;
  /** Undefined while the options load (and after a failed load). */
  summary: DatasetSummaryData | undefined;
  /** The API message of a failed load; shown with "Try again". */
  error?: string | null;
  onRetry?: () => void;
  /** Open the auto-split dialog. */
  onAutoSplit: () => void;
}

/**
 * What a run started now would train on: usable and not-annotated images per split, the
 * images without a split, the class count, and the way to split the rest (D-06).
 */
export function DatasetSummary({
  projectId,
  summary,
  error = null,
  onRetry,
  onAutoSplit,
}: DatasetSummaryProps) {
  const { t, i18n } = useTranslation(["training", "images", "common"]);
  const format = new Intl.NumberFormat(i18n.language);

  return (
    <Paper bg="dark.6" p={16} radius={8} data-testid="dataset-summary">
      <Stack gap={16}>
        <Text size="sm" fw={600}>
          {t("training:summary.title")}
        </Text>
        {summary !== undefined ? (
          <>
            <div role="table" aria-label={t("training:summary.title")}>
              <div role="row" style={ROW_STYLE}>
                <Text role="columnheader" size="xs" c="dark.1">
                  {t("training:summary.columns.split")}
                </Text>
                <Text role="columnheader" size="xs" c="dark.1" style={NUMBER_STYLE}>
                  {t("training:summary.columns.used")}
                </Text>
                <Text role="columnheader" size="xs" c="dark.1" style={NUMBER_STYLE}>
                  {t("training:summary.columns.unannotated")}
                </Text>
              </div>
              {SPLITS.map((split) => (
                <div key={split} role="row" style={ROW_STYLE} data-testid={`summary-row-${split}`}>
                  <Text role="rowheader" size="sm">
                    {t(`images:split.value.${split}`)}
                  </Text>
                  <Text role="cell" size="sm" style={NUMBER_STYLE}>
                    {format.format(summary[split].used)}
                  </Text>
                  <Text role="cell" size="sm" style={NUMBER_STYLE}>
                    {summary[split].unannotated > 0
                      ? format.format(summary[split].unannotated)
                      : NO_VALUE}
                  </Text>
                </div>
              ))}
            </div>
            <Divider />
            <Text size="sm">
              {t("training:summary.noSplit", { count: summary.unassigned })}
            </Text>
            <Stack gap={4}>
              <Text size="sm" c="dark.1">
                {t("training:summary.classes", { count: summary.class_count })}
              </Text>
              {summary.test.used === 0 ? (
                <Text size="xs" c="dark.1">
                  {t("training:summary.testOptional")}
                </Text>
              ) : null}
            </Stack>
            <Stack gap={8}>
              <Button
                variant="default"
                fullWidth
                disabled={summary.unassigned === 0}
                onClick={onAutoSplit}
              >
                {t("training:summary.autoSplit")}
              </Button>
              {summary.unassigned === 0 ? (
                <Text size="xs" c="dark.1">
                  {t("images:autoSplit.openDisabled")}
                </Text>
              ) : null}
              <Text size="xs" c="dark.1">
                <Trans
                  i18nKey="training:summary.manualHint"
                  components={{
                    pagelink: <Anchor component={Link} to={`/projects/${projectId}/images`} inherit />,
                  }}
                />
              </Text>
            </Stack>
          </>
        ) : error !== null ? (
          <Alert color="red" title={t("common:error.title")}>
            <Stack gap={8} align="flex-start">
              <Text size="sm">{error}</Text>
              {onRetry !== undefined ? (
                <Button variant="light" color="red" size="compact-sm" onClick={onRetry}>
                  {t("common:retry")}
                </Button>
              ) : null}
            </Stack>
          </Alert>
        ) : (
          <Stack gap={0} data-testid="summary-loading">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} height={ROW_HEIGHT} radius={4} />
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
