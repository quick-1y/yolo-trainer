import {
  Alert,
  Button,
  Code,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { Project } from "../../api/projects";
import { modelDownloadUrl, useRun } from "../../api/training";
import type { RunDetail, RunStatus } from "../../api/training";
import { RunMetrics } from "./RunMetrics";
import { RunStatusBadge } from "./RunStatusBadge";

interface ProjectOutletContext {
  project: Project;
}

const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;
const ONE_LINE = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/** `h:mm:ss`, the elapsed-time format of the UI-SPEC. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Seconds since `startedAt`, re-read every second (the server only reports the start). */
function useElapsedSeconds(startedAt: string | null, active: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);
  if (startedAt === null) {
    return null;
  }
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
}

function parseRunId(raw: string | undefined): number | null {
  return raw !== undefined && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

export function RunPage() {
  const { t } = useTranslation(["training", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const params = useParams<{ runId: string }>();
  const runId = parseRunId(params.runId);
  const query = useRun(project.id, runId);
  const listPath = `/projects/${project.id}/training`;

  const isNotFound =
    runId === null || (query.error instanceof ApiError && query.error.status === 404);
  if (isNotFound) {
    return (
      <Stack gap="sm" align="flex-start" maw={960}>
        <Title order={2}>{t("training:run.notFound.title")}</Title>
        <Text size="sm" c="dark.1">
          {t("training:run.notFound.body")}
        </Text>
        <Button component={Link} to={listPath} variant="light">
          {t("training:run.notFound.back")}
        </Button>
      </Stack>
    );
  }

  const run = query.data;
  if (run === undefined) {
    if (query.isError) {
      return (
        <Alert color="red" title={t("common:error.title")}>
          <Stack gap={8} align="flex-start">
            <Text size="sm">
              {query.error instanceof ApiError ? query.error.message : String(query.error)}
            </Text>
            <Button
              variant="light"
              color="red"
              size="compact-sm"
              onClick={() => void query.refetch()}
            >
              {t("common:retry")}
            </Button>
          </Stack>
        </Alert>
      );
    }
    return (
      <Stack gap={24} maw={960} data-testid="run-loading">
        <Skeleton height={36} radius={8} />
        <Skeleton height={160} radius={8} />
      </Stack>
    );
  }

  // A failed poll keeps the last data on screen (query.data survives an error).
  return (
    <Stack gap={24} maw={960}>
      <div>
        <Button component={Link} to={listPath} variant="subtle" size="compact-sm">
          {`← ${t("training:run.back")}`}
        </Button>
      </div>
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} align="baseline" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Title order={2} title={run.name} style={{ ...ONE_LINE, minWidth: 0 }}>
            {run.name}
          </Title>
          <RunStatusBadge run={run} />
        </Group>
        {run.status === "completed" && run.model !== null ? (
          <Button
            component="a"
            href={modelDownloadUrl(run.model.id)}
            download={run.model.file_name}
          >
            {t("training:run.download")}
          </Button>
        ) : null}
      </Group>
      <StatusCard run={run} />
      <StatusAnnouncer status={run.status} />
    </Stack>
  );
}

/** One polite live region; it speaks status changes only, never epoch ticks. */
function StatusAnnouncer({ status }: { status: RunStatus }) {
  const { t } = useTranslation("training");
  const previous = useRef<RunStatus | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (previous.current !== null && previous.current !== status) {
      if (status === "completed") {
        setMessage(t("run.completed.title"));
      } else if (status === "failed") {
        setMessage(t("run.failed.title"));
      } else if (status === "interrupted") {
        setMessage(t("run.interrupted.title"));
      }
    }
    previous.current = status;
  }, [status, t]);

  return (
    <VisuallyHidden role="status" aria-live="polite" data-testid="run-live-region">
      {message}
    </VisuallyHidden>
  );
}

function StatusCard({ run }: { run: RunDetail }) {
  // Failed, interrupted and cancelled runs get their own cards in Plan 04-07; the badge
  // in the header already carries the status.
  if (
    run.status !== "preparing" &&
    run.status !== "queued" &&
    run.status !== "running" &&
    run.status !== "completed"
  ) {
    return null;
  }
  return (
    <Paper p={16} radius={8} style={{ background: "var(--mantine-color-dark-6)" }}>
      <Stack gap={16}>
        {run.status === "preparing" ? <PreparingBody /> : null}
        {run.status === "queued" ? <QueuedBody run={run} /> : null}
        {run.status === "running" ? <RunningBody run={run} /> : null}
        {run.status === "completed" ? <CompletedBody run={run} /> : null}
      </Stack>
    </Paper>
  );
}

function PreparingBody() {
  const { t } = useTranslation("training");
  return (
    <>
      <Group gap={8}>
        <Loader size={16} />
        <Text fw={600}>{t("run.preparing.title")}</Text>
      </Group>
      <Text size="sm" c="dark.1">
        {t("run.preparing.body")}
      </Text>
    </>
  );
}

function QueuedBody({ run }: { run: RunDetail }) {
  const { t } = useTranslation("training");
  return (
    <>
      <Text fw={600} style={TABULAR}>
        {t("run.queued.title", { position: run.queue_position ?? 1 })}
      </Text>
      <Text size="sm" c="dark.1">
        {t("run.queued.body")}
      </Text>
    </>
  );
}

function RunningBody({ run }: { run: RunDetail }) {
  const { t, i18n } = useTranslation("training");
  const elapsed = useElapsedSeconds(run.started_at, true);
  const epochs = run.epochs;
  const hasEpoch = run.epoch !== null && epochs !== null && epochs > 0;
  // The final validation emits one more event than there are epochs; never show Y+1 (D-12).
  const shown = hasEpoch ? Math.min(run.epoch as number, epochs as number) : 0;
  const map50 =
    run.last_map50 === null
      ? "—"
      : new Intl.NumberFormat(i18n.language, {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(run.last_map50);

  return (
    <>
      <Group justify="space-between" align="baseline" wrap="nowrap">
        {hasEpoch ? (
          <Text fw={600} style={TABULAR}>
            {t("run.running.epoch", { epoch: shown, epochs })}
          </Text>
        ) : (
          <Group gap={8}>
            <Loader size={16} />
            <Text fw={600}>{t("run.running.starting")}</Text>
          </Group>
        )}
        {elapsed !== null ? (
          <Text size="sm" c="dark.1" style={TABULAR}>
            {t("run.running.elapsed", { time: formatClock(elapsed) })}
          </Text>
        ) : null}
      </Group>
      {hasEpoch ? (
        <Stack gap={4}>
          <Progress.Root
            size={8}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={epochs as number}
            aria-valuenow={shown}
            aria-live="off"
          >
            <Progress.Section value={(shown / (epochs as number)) * 100} withAria={false} />
          </Progress.Root>
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dark.1" style={TABULAR}>
              {t("run.running.map50", { value: map50 })}
            </Text>
            <Text size="xs" c="dark.1">
              {t("run.running.closeHint")}
            </Text>
          </Group>
          {shown >= (epochs as number) ? (
            <Text size="sm" c="dark.1">
              {t("run.running.finishing")}
            </Text>
          ) : null}
        </Stack>
      ) : (
        <>
          <Text size="sm" c="dark.1">
            {t("run.running.startingHint")}
          </Text>
          <Text size="xs" c="dark.1">
            {t("run.running.closeHint")}
          </Text>
        </>
      )}
    </>
  );
}

function CompletedBody({ run }: { run: RunDetail }) {
  const { t, i18n } = useTranslation("training");
  const duration =
    run.started_at !== null && run.finished_at !== null
      ? formatClock((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
      : null;
  const model = run.model;
  const size =
    model === null
      ? ""
      : new Intl.NumberFormat(i18n.language, {
          style: "unit",
          unit: "megabyte",
          maximumFractionDigits: 1,
        }).format(model.size_bytes / 1e6);

  return (
    <>
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Text fw={600}>{t("run.completed.title")}</Text>
        {duration !== null ? (
          <Text size="sm" c="dark.1" style={TABULAR}>
            {t("run.completed.duration", { time: duration })}
          </Text>
        ) : null}
      </Group>
      <RunMetrics run={run} />
      {model !== null ? (
        <>
          <Divider />
          <Stack gap={4}>
            <Text size="xs" c="dark.1">
              {t("model.file", { file: model.file_name, size })}
            </Text>
            <Text size="xs" c="dark.1">
              <Trans
                i18nKey="model.usage"
                ns="training"
                values={{ code: `YOLO("${model.file_name}")` }}
                components={{ code: <Code fz={12} /> }}
              />
            </Text>
            {model.ultralytics_version !== null ? (
              <Text size="xs" c="dark.1">
                {t("model.version", { version: model.ultralytics_version })}
              </Text>
            ) : null}
          </Stack>
        </>
      ) : null}
    </>
  );
}
