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
        <Paper radius={8} style={{ background: "var(--mantine-color-dark-6)", overflow: "hidden" }}>
          <div className={classes.headerRow}>
            <Text size="xs" c="dark.1">
              {t("training:list.columns.name")}
            </Text>
            <Text size="xs" c="dark.1">
              {t("training:list.columns.status")}
            </Text>
            <Text size="xs" c="dark.1">
              {t("training:list.columns.base")}
            </Text>
            <Text size="xs" c="dark.1">
              {t("training:list.columns.created")}
            </Text>
            <Text size="xs" c="dark.1" ta="right">
              {t("training:list.columns.map50")}
            </Text>
            <span />
          </div>
          {items.map((run) => (
            <RunRow key={run.id} run={run} language={i18n.language} />
          ))}
        </Paper>
      )}
    </Stack>
  );
}

interface RunRowProps {
  run: RunSummary;
  language: string;
}

function RunRow({ run, language }: RunRowProps) {
  const { t } = useTranslation("training");
  const map50Format = new Intl.NumberFormat(language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  return (
    <div className={classes.row} data-testid="run-row">
      <Link to={`${run.id}`} className={classes.nameLink} title={run.name} data-testid="run-name">
        {run.name}
      </Link>
      <RunStatusBadge run={run} />
      <div className={classes.cell} title={run.base_name}>
        {run.base_name}
      </div>
      <div className={classes.cell}>{formatRelativeTime(run.created_at, language)}</div>
      <div className={`${classes.cell} ${classes.numeric}`}>
        {run.map50 === null ? "—" : map50Format.format(run.map50)}
      </div>
      <div>
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
