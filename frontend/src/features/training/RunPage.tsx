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
import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { Project } from "../../api/projects";
import { modelDownloadUrl, useRun } from "../../api/training";
import type { RunDetail, RunStatus } from "../../api/training";
import { BatchProgress } from "./progress/BatchProgress";
import { estimateRemainingSeconds } from "./progress/eta";
import type { ProgressState } from "./progress/foldProgress";
import { RunCharts } from "./progress/RunCharts";
import { useRunStream } from "./progress/useRunStream";
import { FailureAlert } from "./FailureAlert";
import { CancelRunModal } from "./CancelRunModal";
import { FinalResultsCard } from "./FinalResultsCard";
import { RemoveFromQueueModal } from "./RemoveFromQueueModal";
import { RunSettingsCard } from "./RunSettingsCard";
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
  // A hook, so it runs before the early returns below. The stream opens once the run has left
  // the preparing and queued states and closes itself when the server sends `end`.
  const [streamHealthy, setStreamHealthy] = useState(false);
  const query = useRun(project.id, runId, { streamHealthy });
  const [removeOpened, setRemoveOpened] = useState(false);
  const [cancelOpened, setCancelOpened] = useState(false);
  const listPath = `/projects/${project.id}/training`;
  const streamStatus = query.data?.status;
  const streamEnabled =
    runId !== null &&
    streamStatus !== undefined &&
    streamStatus !== "preparing" &&
    streamStatus !== "queued";
  const { progress, connection, retry } = useRunStream(project.id, runId ?? 0, {
    enabled: streamEnabled,
    resumeKey: 0,
  });
  // The page polls slowly only while the stream is healthy; any other state falls back to 3 s.
  useEffect(() => setStreamHealthy(connection === "open"), [connection]);

  const isNotFound =
    runId === null || (query.error instanceof ApiError && query.error.status === 404);
  if (isNotFound) {
    return (
      <Stack gap={8} align="flex-start" maw={960}>
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
        {run.status === "queued" ? (
          <Button variant="light" color="red" onClick={() => setRemoveOpened(true)}>
            {t("training:run.remove.open")}
          </Button>
        ) : null}
        {run.status === "running" && !run.cancelling ? (
          <Button variant="light" color="red" onClick={() => setCancelOpened(true)}>
            {t("training:run.cancel.open")}
          </Button>
        ) : null}
        {run.status === "running" && run.cancelling ? (
          <Button
            variant="light"
            color="red"
            disabled
            leftSection={<Loader size={16} color="gray" aria-hidden="true" />}
          >
            {t("training:status.cancelling")}
          </Button>
        ) : null}
      </Group>
      <StatusCard run={run} progress={progress} />
      <FinalResultsCard run={run} finalMetrics={progress.finalMetrics} />
      {streamEnabled ? (
        <RunCharts
          progress={progress}
          connection={connection}
          running={run.status === "running"}
          epochs={run.epochs ?? run.settings.epochs}
          onRetry={retry}
        />
      ) : null}
      <RunSettingsCard run={run} />
      <StatusAnnouncer status={run.status} />
      {run.status === "queued" ? (
        <RemoveFromQueueModal
          projectId={project.id}
          run={run}
          opened={removeOpened}
          onClose={() => {
            setRemoveOpened(false);
            // The worker may have claimed the run while the modal was open.
            void query.refetch();
          }}
        />
      ) : null}
      {run.status === "running" ? (
        <CancelRunModal
          projectId={project.id}
          run={run}
          opened={cancelOpened}
          onClose={() => {
            setCancelOpened(false);
            // The run may have finished while the modal was open, or the cancel was accepted.
            void query.refetch();
          }}
        />
      ) : null}
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

function InterruptedAlert({ run }: { run: RunDetail }) {
  const { t } = useTranslation("training");
  return (
    <Alert color="orange" title={t("run.interrupted.title")}>
      <Stack gap={8} align="flex-start">
        <Text size="sm">{t("run.interrupted.body")}</Text>
        {run.epoch !== null ? (
          <Text size="sm" style={TABULAR}>
            {t("run.interrupted.reached", { epoch: run.epoch, epochs: run.epochs ?? run.settings.epochs })}
          </Text>
        ) : null}
        <Text size="sm">{t("run.interrupted.action")}</Text>
        <Button variant="default" component={Link} to="../new" relative="path">
          {t("page.new")}
        </Button>
      </Stack>
    </Alert>
  );
}

function CancelledAlert() {
  const { t } = useTranslation("training");
  return (
    <Alert color="gray" title={t("run.cancelled.title")}>
      <Text size="sm">{t("run.cancelled.body")}</Text>
    </Alert>
  );
}

function StatusCard({ run, progress }: { run: RunDetail; progress: ProgressState }) {
  if (run.status === "failed") {
    return <FailureAlert run={run} />;
  }
  if (run.status === "interrupted") {
    return <InterruptedAlert run={run} />;
  }
  if (run.status === "cancelled") {
    return <CancelledAlert />;
  }
  return (
    <Paper p={16} radius={8} style={{ background: "var(--mantine-color-dark-6)" }}>
      <Stack gap={16}>
        {run.status === "preparing" ? <PreparingBody /> : null}
        {run.status === "queued" ? <QueuedBody run={run} /> : null}
        {run.status === "running" ? <RunningBody run={run} progress={progress} /> : null}
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

function RunningBody({ run, progress }: { run: RunDetail; progress: ProgressState }) {
  const { t, i18n } = useTranslation("training");
  const elapsed = useElapsedSeconds(run.started_at, true);
  const epochs = run.epochs;
  const hasEpoch = run.epoch !== null && epochs !== null && epochs > 0;
  const lastRowEpoch = progress.rows.length > 0 ? progress.rows[progress.rows.length - 1].epoch : 0;
  // The run query is polled slowly while the stream is healthy: once the stream says the last
  // real epoch is done, trust its epoch. The final validation emits one more event than there
  // are epochs; never show Y+1 (D-12).
  const reached =
    progress.phase === "final_validation"
      ? Math.max(run.epoch ?? 0, lastRowEpoch)
      : (run.epoch ?? 0);
  const shown = hasEpoch ? Math.min(reached, epochs as number) : 0;
  const map50 =
    run.last_map50 === null
      ? "—"
      : new Intl.NumberFormat(i18n.language, {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(run.last_map50);
  // Recomputed only when a batch or epoch event changes `progress`; the clock tick above
  // re-renders every second but never changes the estimate (D-03).
  const eta = useMemo(() => estimateRemainingSeconds(progress), [progress]);
  const batch = progress.batch;
  // After the last real epoch (or, for a Phase 4 run, at epoch = epochs) the run only validates
  // best.pt: no batch bar, no ETA, the epoch bar stays full (D-04).
  const finalPhase = progress.phase === "final_validation" || (hasEpoch && shown >= (epochs as number));
  // "Time left: —" is only meaningful next to an epoch headline; Starting shows an ETA once known.
  const etaText = finalPhase
    ? null
    : eta !== null
      ? t("run.running.eta", { time: formatClock(eta) })
      : hasEpoch
        ? t("run.running.etaUnknown")
        : null;
  const headlineRight = [
    elapsed !== null ? t("run.running.elapsed", { time: formatClock(elapsed) }) : null,
    etaText,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  if (run.cancelling) {
    // A cancel is waiting for the worker: no bars, no ETA, no batch caption (charts stay on screen).
    return (
      <>
        <Group gap={8}>
          <Loader size={16} />
          <Text fz={16} fw={600}>
            {t("run.cancelling.title")}
          </Text>
        </Group>
        <Text size="sm" c="dark.1">
          {t("run.cancelling.body")}
        </Text>
      </>
    );
  }

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
        {headlineRight !== "" ? (
          <Text size="sm" c="dark.1" style={{ ...TABULAR, ...ONE_LINE, flexShrink: 0 }}>
            {headlineRight}
          </Text>
        ) : null}
      </Group>
      {!hasEpoch ? (
        <Text size="sm" c="dark.1">
          {t("run.running.startingHint")}
        </Text>
      ) : null}
      <Stack gap={8}>
        {hasEpoch ? (
          <Progress.Root
            size={8}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={epochs as number}
            aria-valuenow={shown}
            aria-live="off"
          >
            <Progress.Section
              value={finalPhase ? 100 : (shown / (epochs as number)) * 100}
              withAria={false}
            />
          </Progress.Root>
        ) : null}
        {finalPhase ? (
          <Stack gap={4}>
            <Group gap={8} wrap="nowrap">
              <Loader size={12} />
              <Text fz={14} fw={600}>
                {t("run.running.finalValidation")}
              </Text>
            </Group>
            <Text size="xs" c="dark.1">
              {t("run.running.finalValidationHint")}
            </Text>
          </Stack>
        ) : batch !== null ? (
          <BatchProgress batch={batch} map50={map50} />
        ) : hasEpoch ? (
          <Text size="xs" c="dark.1" style={TABULAR}>
            {t("run.running.map50", { value: map50 })}
          </Text>
        ) : null}
        <Text size="xs" c="dark.1">
          {t("run.running.closeHint")}
        </Text>
        {progress.resumedFrom !== null ? (
          <Text size="xs" c="dark.1" style={TABULAR}>
            {t("run.running.resumedNote", { epoch: progress.resumedFrom })}
          </Text>
        ) : null}
      </Stack>
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
      {run.epoch !== null && run.epochs !== null && run.epoch < run.epochs ? (
        <Text size="sm" c="dark.1" style={TABULAR}>
          {t("run.completed.earlyStop", { epoch: run.epoch, epochs: run.epochs })}
        </Text>
      ) : null}
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
