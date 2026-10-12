import {
  ActionIcon,
  Alert,
  Button,
  EmptyState,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { Project } from "../../api/projects";
import { modelDownloadUrl, useRuns } from "../../api/training";
import type { RunSummary } from "../../api/training";
import { formatRelativeTime } from "../../lib/relativeTime";
import { formatKeySettings, historyMetric, keySettingsParts } from "./historyTable";
import { runActiveSeconds } from "./progress/duration";
import { formatClock } from "./RunPage";
import { RunStatusBadge } from "./RunStatusBadge";
import classes from "./TrainingPage.module.css";

interface ProjectOutletContext {
  project: Project;
}

const SKELETON_ROWS = [0, 1, 2];

// The list is not paginated or virtualized (expected under about 200 runs); the page
// scrolls with the rest of the project content. The server returns newest first.
export function TrainingPage() {
  const { t, i18n } = useTranslation(["training", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const runs = useRuns(project.id);
  const items = runs.data ?? [];
  const isEmpty = runs.isSuccess && items.length === 0;
  // The time the live part of a running run's duration is measured to: the last fetch, so the
  // column moves with the poll and not every second (UI-SPEC "History table").
  const nowMs = runs.dataUpdatedAt || Date.now();

  const newTrainingButton = (
    <Button component={Link} to="new">
      {t("training:page.new")}
    </Button>
  );

  return (
    <Stack gap={24}>
      <Group justify="space-between" align="baseline">
        <Group align="baseline" gap={8}>
          <Title order={2}>{t("training:page.title")}</Title>
          {runs.isSuccess ? (
            <Text size="sm" c="dark.1">
              {t("training:page.count", { count: items.length })}
            </Text>
          ) : null}
        </Group>
        {isEmpty ? null : newTrainingButton}
      </Group>
      {runs.isPending ? (
        <Stack gap={8} data-testid="runs-loading">
          {SKELETON_ROWS.map((key) => (
            <Skeleton key={key} height={48} radius={8} />
          ))}
        </Stack>
      ) : runs.isError ? (
        <Alert color="red" title={t("common:error.title")}>
          <Stack gap={8} align="flex-start">
            <Text size="sm">
              {runs.error instanceof ApiError ? runs.error.message : String(runs.error)}
            </Text>
            <Button
              variant="light"
              color="red"
              size="compact-sm"
              onClick={() => void runs.refetch()}
            >
              {t("common:retry")}
            </Button>
          </Stack>
        </Alert>
      ) : isEmpty ? (
        <EmptyState
          title={t("training:list.empty.title")}
          description={t("training:list.empty.body")}
          py={64}
        >
          <EmptyState.Actions>{newTrainingButton}</EmptyState.Actions>
        </EmptyState>
      ) : (
        <Paper
          radius={8}
          className={classes.scroller}
          style={{ background: "var(--mantine-color-dark-6)" }}
        >
          <div className={classes.table} role="table" aria-label={t("training:page.title")}>
            <div className={classes.headerRow} role="row">
              <Text size="xs" c="dark.1" className={classes.nameCell} role="columnheader">
                {t("training:list.columns.name")}
              </Text>
              <Text size="xs" c="dark.1" role="columnheader">
                {t("training:list.columns.status")}
              </Text>
              <Text size="xs" c="dark.1" role="columnheader">
                {t("training:list.columns.base")}
              </Text>
              <Text size="xs" c="dark.1" role="columnheader">
                {t("training:list.columns.created")}
              </Text>
              <Text size="xs" c="dark.1" ta="right" role="columnheader">
                {t("training:list.columns.duration")}
              </Text>
              <Text size="xs" c="dark.1" ta="right" role="columnheader">
                {t("training:list.columns.epochs")}
              </Text>
              <Text size="xs" c="dark.1" role="columnheader">
                {t("training:list.columns.settings")}
              </Text>
              <Text size="xs" c="dark.1" ta="right" role="columnheader">
                {t("training:list.columns.map50")}
              </Text>
              <Text size="xs" c="dark.1" ta="right" role="columnheader">
                {t("training:list.columns.map5095")}
              </Text>
              <Text
                size="xs"
                c="dark.1"
                ta="right"
                role="columnheader"
                title={t("training:list.columns.imagesTitle")}
              >
                {t("training:list.columns.images")}
              </Text>
              <span role="columnheader" />
            </div>
            {items.map((run) => (
              <RunRow key={run.id} run={run} language={i18n.language} nowMs={nowMs} />
            ))}
          </div>
        </Paper>
      )}
    </Stack>
  );
}

interface RunRowProps {
  run: RunSummary;
  language: string;
  nowMs: number;
}

function RunRow({ run, language, nowMs }: RunRowProps) {
  const { t } = useTranslation("training");
  const metricFormat = new Intl.NumberFormat(language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const countFormat = new Intl.NumberFormat(language);
  const seconds = runActiveSeconds(run, nowMs);
  const epochs =
    run.epoch === null || run.epochs === null ? "—" : `${Math.min(run.epoch, run.epochs)}/${run.epochs}`;
  const settings = keySettingsParts(run, t);

  const metric = (key: "map50" | "map50_95") => {
    const { value, lastEpoch } = historyMetric(run, key);
    return (
      <div
        className={`${classes.cell} ${classes.numeric}`}
        role="cell"
        title={lastEpoch ? t("list.lastEpochValue") : undefined}
      >
        {value === null ? "—" : metricFormat.format(value)}
      </div>
    );
  };

  return (
    <div className={classes.row} data-testid="run-row" role="row">
      {/* The link covers the whole row (stretched anchor); it is not the sticky cell, because a
          sticky cell would become the containing block of the stretched pseudo-element. */}
      <Link to={`${run.id}`} className={classes.rowLink} title={run.name} aria-label={run.name} />
      <div className={classes.nameCell} role="cell">
        <span className={classes.nameText} data-testid="run-name" aria-hidden="true">
          {run.name}
        </span>
      </div>
      <div role="cell">
        <RunStatusBadge run={run} />
      </div>
      <div className={classes.cell} role="cell" title={run.base_name}>
        {run.base_name}
      </div>
      <div className={classes.cell} role="cell">
        {formatRelativeTime(run.created_at, language)}
      </div>
      <div className={`${classes.cell} ${classes.numeric}`} role="cell">
        {seconds === null ? "—" : formatClock(seconds)}
      </div>
      <div className={`${classes.cell} ${classes.numeric}`} role="cell">
        {epochs}
      </div>
      <div
        className={classes.cell}
        role="cell"
        title={t("list.settingsTitle", settings)}
      >
        {formatKeySettings(run, t)}
      </div>
      {metric("map50")}
      {metric("map50_95")}
      <div className={`${classes.cell} ${classes.numeric}`} role="cell">
        {run.image_count === null ? "—" : countFormat.format(run.image_count)}
      </div>
      <div role="cell" className={classes.downloadCell}>
        {run.status === "completed" && run.model !== null ? (
          <ActionIcon
            component="a"
            variant="subtle"
            className={classes.download}
            href={modelDownloadUrl(run.model.id)}
            download={run.model.file_name}
            aria-label={t("list.downloadAria", { file: run.model.file_name })}
          >
            ↓
          </ActionIcon>
        ) : null}
      </div>
    </div>
  );
}
