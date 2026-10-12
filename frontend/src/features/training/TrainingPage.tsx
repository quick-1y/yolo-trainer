import {
  ActionIcon,
  Alert,
  Button,
  EmptyState,
  Group,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { Project } from "../../api/projects";
import { modelDownloadUrl, useRuns } from "../../api/training";
import type { RunSummary } from "../../api/training";
import { formatRelativeTime } from "../../lib/relativeTime";
import {
  filterRuns,
  firstDirection,
  formatKeySettings,
  historyMetric,
  historyParams,
  keySettingsParts,
  parseHistoryParams,
  RUN_STATUSES,
  sortRuns,
} from "./historyTable";
import type { HistoryDirection, HistorySort, HistoryState } from "./historyTable";
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

  // Sort, direction and status filter live in the URL (D-14), reloadable and shareable. Writes
  // use `replace`, so changing the view never adds history entries; defaults are omitted and an
  // unchanged URL is not written again (the ImagesPage idiom).
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseHistoryParams(searchParams);
  const writeView = (next: HistoryState) => {
    const params = historyParams(next);
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  };
  const sortBy = (column: HistorySort) =>
    writeView(
      view.sort === column
        ? { ...view, dir: view.dir === "asc" ? "desc" : "asc" }
        : { ...view, sort: column, dir: firstDirection(column) },
    );
  const visible = sortRuns(filterRuns(items, view.status), view.sort, view.dir, nowMs);
  const filteredToZero = items.length > 0 && visible.length === 0;
  const columns = historyColumns(t);

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
              {visible.length === items.length
                ? t("training:page.count", { count: items.length })
                : t("training:page.countFiltered", { shown: visible.length, total: items.length })}
            </Text>
          ) : null}
        </Group>
        {isEmpty ? null : (
          <Group gap={8}>
            <Select
              w={200}
              size="sm"
              searchable={false}
              allowDeselect={false}
              aria-label={t("training:list.filter.aria")}
              data={[
                { value: "all", label: t("training:list.filter.all") },
                ...RUN_STATUSES.map((status) => ({
                  value: status,
                  label: t(`training:status.${status}`),
                })),
              ]}
              value={view.status}
              onChange={(value) =>
                writeView({ ...view, status: RUN_STATUSES.find((status) => status === value) ?? "all" })
              }
            />
            {newTrainingButton}
          </Group>
        )}
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
              {columns.map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  active={column.sort === view.sort}
                  dir={view.dir}
                  onSort={sortBy}
                />
              ))}
            </div>
            {filteredToZero ? (
              <div className={classes.filteredEmpty}>
                <EmptyState
                  title={t("training:list.filteredEmpty.title")}
                  description={t("training:list.filteredEmpty.body")}
                  py={48}
                >
                  <EmptyState.Actions>
                    <Button variant="default" onClick={() => writeView({ ...view, status: "all" })}>
                      {t("training:list.filteredEmpty.reset")}
                    </Button>
                  </EmptyState.Actions>
                </EmptyState>
              </div>
            ) : (
              visible.map((run) => (
                <RunRow key={run.id} run={run} language={i18n.language} nowMs={nowMs} />
              ))
            )}
          </div>
        </Paper>
      )}
    </Stack>
  );
}

interface HistoryColumn {
  key: string;
  /** Null for the columns that are not sortable (Settings, Download). */
  sort: HistorySort | null;
  label: string;
  align: "left" | "right";
  title?: string;
  sticky?: boolean;
}

/** The eleven columns in UI-SPEC order; the sort keys follow `HistorySort`. */
function historyColumns(t: (key: string) => string): HistoryColumn[] {
  return [
    { key: "name", sort: "name", label: t("training:list.columns.name"), align: "left", sticky: true },
    { key: "status", sort: "status", label: t("training:list.columns.status"), align: "left" },
    { key: "base", sort: "base", label: t("training:list.columns.base"), align: "left" },
    { key: "created", sort: "created", label: t("training:list.columns.created"), align: "left" },
    { key: "duration", sort: "duration", label: t("training:list.columns.duration"), align: "right" },
    { key: "epochs", sort: "epochs", label: t("training:list.columns.epochs"), align: "right" },
    { key: "settings", sort: null, label: t("training:list.columns.settings"), align: "left" },
    { key: "map50", sort: "map50", label: t("training:list.columns.map50"), align: "right" },
    { key: "map5095", sort: "map5095", label: t("training:list.columns.map5095"), align: "right" },
    {
      key: "images",
      sort: "images",
      label: t("training:list.columns.images"),
      align: "right",
      title: t("training:list.columns.imagesTitle"),
    },
    { key: "download", sort: null, label: "", align: "left" },
  ];
}

interface HeaderCellProps {
  column: HistoryColumn;
  active: boolean;
  dir: HistoryDirection;
  onSort: (sort: HistorySort) => void;
}

/** A header cell: a sort button with `aria-sort` for the nine sortable columns, plain text else. */
function HeaderCell({ column, active, dir, onSort }: HeaderCellProps) {
  const { t } = useTranslation("training");
  const className = [
    classes.headerCell,
    column.align === "right" ? classes.headerRight : "",
    column.sticky ? classes.nameCell : "",
  ].join(" ");
  const { sort } = column;
  if (sort === null) {
    return (
      <Text size="xs" c="dark.1" className={className} role="columnheader">
        {column.label}
      </Text>
    );
  }
  return (
    <div
      className={className}
      role="columnheader"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <UnstyledButton
        className={classes.sortButton}
        aria-label={t("list.sortAria", { column: column.label })}
        title={column.title}
        data-active={active ? "true" : undefined}
        onClick={() => onSort(sort)}
      >
        <Text
          component="span"
          size="xs"
          fw={active ? 600 : 400}
          c={active ? "var(--mantine-color-text)" : "dark.1"}
          className={classes.sortLabel}
        >
          {column.label}
        </Text>
        {active ? (
          <Text
            component="span"
            size="xs"
            fw={600}
            c="var(--mantine-color-text)"
            ml={4}
            aria-hidden="true"
          >
            {dir === "asc" ? "↑" : "↓"}
          </Text>
        ) : null}
      </UnstyledButton>
    </div>
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
