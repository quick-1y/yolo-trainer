import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest } from "./client";
import type { TaskType } from "./projects";
import { projectKeys } from "./projects";

export type RunStatus =
  | "preparing"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled";

/** Statuses in which a run still changes on its own, so the UI keeps polling (D-17). */
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["preparing", "queued", "running"];

export function isActiveRunStatus(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export type DeviceChoice = "auto" | "cpu" | "0";

export type QualityLevel = "excellent" | "good" | "fair" | "poor";

export interface RunSettings {
  epochs: number;
  imgsz: number;
  /** -1 means "auto". */
  batch: number;
  device: DeviceChoice;
}

export interface RunResolved {
  device: string;
  batch: number;
  workers: number;
}

export interface DatasetCounts {
  train: number;
  valid: number;
  test: number;
}

export interface RunMetrics {
  precision: number | null;
  recall: number | null;
  map50: number | null;
  map50_95: number | null;
}

export interface RunModelRef {
  id: number;
  file_name: string;
  size_bytes: number;
  ultralytics_version: string | null;
}

export interface RunSummary {
  id: number;
  project_id: number;
  name: string;
  status: RunStatus;
  queue_position: number | null;
  task_type: TaskType;
  base_kind: "official" | "model";
  base_name: string;
  epoch: number | null;
  epochs: number | null;
  last_map50: number | null;
  map50: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  model: RunModelRef | null;
  /** Verdict on mAP50 computed by the server (null while there is no final mAP50). */
  quality: QualityLevel | null;
}

export interface RunDetail extends RunSummary {
  settings: RunSettings;
  resolved: RunResolved | null;
  dataset_counts: DatasetCounts | null;
  class_names: string[] | null;
  metrics: RunMetrics | null;
  error_message: string | null;
  log_tail: string | null;
}

export interface OfficialModelOption {
  name: string;
  /** "n" | "s" | "m" | "l" | "x" */
  size: string;
}

export interface TrainingDefaults {
  epochs: number;
  imgsz: number;
  batch: number;
  device: DeviceChoice;
}

export interface GpuOption {
  index: number;
  name: string;
}

export interface TrainingDevices {
  gpus: GpuOption[];
  worker_fresh: boolean;
}

/** One split: images a run would use and assigned images it would leave out (D-04). */
export interface SplitUsage {
  used: number;
  unannotated: number;
}

/** What a run started now would train on (D-06). */
export interface DatasetSummary {
  train: SplitUsage;
  valid: SplitUsage;
  test: SplitUsage;
  /** Images without a split; they are never used. */
  unassigned: number;
  class_count: number;
}

export type TrainingNoteCode =
  | "noClasses"
  | "trainEmpty"
  | "validEmpty"
  | "unannotated"
  | "unassigned"
  | "classesMissingTrain"
  | "classesMissingValid"
  | "workerStale";

/** A blocker or a warning as a code with parameters; the UI words it (D-05). */
export interface TrainingNote {
  code: TrainingNoteCode;
  count: number;
  names: string[];
}

/** A model trained in this service that can be the base of a new run (D-08). */
export interface TrainedModelOption {
  id: number;
  name: string;
  project_id: number | null;
  project_name: string | null;
  map50: number | null;
  class_count: number;
  class_names: string[];
  /** True only when the class names equal the project's, in the same order. */
  classes_match: boolean;
  created_at: string;
}

export interface TrainingOptions {
  task_type: TaskType;
  next_run_name: string;
  official: OfficialModelOption[];
  default_base: string;
  defaults: TrainingDefaults;
  devices: TrainingDevices;
  models: TrainedModelOption[];
  summary: DatasetSummary;
  blockers: TrainingNote[];
  warnings: TrainingNote[];
}

export type RunBaseInput = { kind: "official"; name: string } | { kind: "model"; model_id: number };

export interface RunCreateInput {
  name?: string;
  base: RunBaseInput;
  epochs: number;
  imgsz: number;
  /** -1 means "auto". */
  batch: number;
  device: DeviceChoice;
}

/** How often run lists and run pages refetch while a run is preparing, queued or running. */
export const RUN_POLL_INTERVAL_MS = 3000;

/** The run that is training right now (`GET /training/active`, D-14). */
export interface ActiveRun {
  run_id: number;
  project_id: number;
  project_name: string;
  run_name: string;
  /** Null until the first epoch finishes. */
  epoch: number | null;
  epochs: number | null;
  started_at: string | null;
}

export const trainingKeys = {
  runs: (projectId: number) => ["runs", projectId] as const,
  run: (projectId: number, runId: number) => ["run", projectId, runId] as const,
  options: (projectId: number) => ["trainingOptions", projectId] as const,
  // Its own root, so no invalidation of another training key matches it.
  active: () => ["trainingActive"] as const,
};

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function useRuns(projectId: number) {
  return useQuery({
    queryKey: trainingKeys.runs(projectId),
    queryFn: () => apiRequest<RunSummary[]>(`/projects/${projectId}/runs`),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isActiveRunStatus(run.status)) ? RUN_POLL_INTERVAL_MS : false,
  });
}

export function useRun(projectId: number, runId: number | null) {
  return useQuery({
    queryKey: trainingKeys.run(projectId, runId ?? 0),
    queryFn: () => apiRequest<RunDetail>(`/projects/${projectId}/runs/${runId}`),
    enabled: runId !== null,
    // A missing run will not appear by retrying; show "Run not found" at once.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 2,
    refetchInterval: (query) => {
      if (isNotFound(query.state.error)) {
        return false;
      }
      const run = query.state.data;
      return run !== undefined && isActiveRunStatus(run.status) ? RUN_POLL_INTERVAL_MS : false;
    },
  });
}

/**
 * The running run, polled on every page through one shared query (D-14). Deliberately sets no
 * `enabled`, so the test harness can switch the poller off with `setQueryDefaults`.
 */
export function useActiveRun() {
  return useQuery({
    queryKey: trainingKeys.active(),
    queryFn: () => apiRequest<ActiveRun | null>("/training/active"),
    refetchInterval: RUN_POLL_INTERVAL_MS,
    // The header and the project sidebar both observe this query; a second observer that mounts
    // right after the first must reuse its answer instead of asking again (one request per page).
    staleTime: RUN_POLL_INTERVAL_MS / 2,
    retry: false,
  });
}

export function activeRunPath(run: ActiveRun): string {
  return `/projects/${run.project_id}/training/${run.run_id}`;
}

export function useTrainingOptions(projectId: number) {
  return useQuery({
    queryKey: trainingKeys.options(projectId),
    queryFn: () => apiRequest<TrainingOptions>(`/projects/${projectId}/training/options`),
    // The form reads a fresh worker heartbeat and run name on every visit.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateRun(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RunCreateInput) =>
      apiRequest<RunDetail>(`/projects/${projectId}/runs`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.runs(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

/** Take a queued run out of the queue (D-11); a 409 means the worker claimed it first. */
export function useRemoveQueuedRun(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) =>
      apiRequest<void>(`/projects/${projectId}/runs/${runId}`, { method: "DELETE" }),
    onSuccess: (_data, runId) => {
      queryClient.removeQueries({ queryKey: trainingKeys.run(projectId, runId) });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.runs(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

/** A plain GET target for `<a href download>`; never fetched as a blob (MODL-04). */
export function modelDownloadUrl(modelId: number): string {
  return `/api/models/${modelId}/download`;
}
