import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { configQueryKey } from "../../api/config";
import type { AppConfig } from "../../api/config";
import { imageKeys, uploadImageBatch } from "../../api/images";
import { classifyFiles } from "../../lib/imageFiles";
import { planBatches, runUploadQueue } from "../../lib/uploadQueue";

export interface RejectedEntry {
  name: string;
  reason: string;
}

export interface UploadState {
  status: "idle" | "running" | "done" | "cancelled";
  total: number;
  processed: number;
  added: number;
  duplicates: number;
  rejected: RejectedEntry[];
  hadRequestFailures: boolean;
}

interface UploadContextValue {
  state: UploadState;
  startUpload: (files: File[]) => void;
  cancel: () => void;
  dismiss: () => void;
}

const CONCURRENCY = 3;

const IDLE: UploadState = {
  status: "idle",
  total: 0,
  processed: 0,
  added: 0,
  duplicates: 0,
  rejected: [],
  hadRequestFailures: false,
};

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * Project-scoped upload state living above the project's routes, so moving
 * between sidebar sections does not cancel a running upload. State holds
 * counters and the rejected list only (never per-file rows) and is updated
 * once per finished batch (D-04).
 */
export function UploadProvider({
  projectId,
  children,
}: {
  projectId: number;
  children: ReactNode;
}) {
  const { t } = useTranslation("images");
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>(IDLE);
  const runningRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const unmountedRef = useRef(false);

  // Leaving the project cancels the remaining batches; stored images stay.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      controllerRef.current?.abort();
    };
  }, []);

  const running = state.status === "running";
  useEffect(() => {
    if (!running) {
      return;
    }
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [running]);

  const startUpload = useCallback(
    (files: File[]) => {
      // Read from the cache, not a hook: the Images page loads the limits
      // (its buttons stay disabled until then) and other sections never fetch them.
      const limits = queryClient.getQueryData<AppConfig>(configQueryKey);
      if (files.length === 0 || limits === undefined) {
        return;
      }
      if (runningRef.current) {
        notifications.show({ color: "yellow", message: t("busy") });
        return;
      }
      runningRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;

      const { accepted, rejected } = classifyFiles(files, {
        maxUploadBytes: limits.max_upload_bytes,
        acceptedExtensions: limits.accepted_extensions,
      });
      const clientRejected: RejectedEntry[] = rejected.map(({ name, code }) => ({
        name,
        reason: t(code === "unsupported" ? "reject.unsupported" : "reject.tooLarge", {
          max: limits.max_upload_mb,
        }),
      }));
      setState({
        ...IDLE,
        status: "running",
        total: files.length,
        processed: clientRejected.length,
        rejected: clientRejected,
      });

      runUploadQueue({
        batches: planBatches(accepted, limits.max_upload_bytes),
        concurrency: CONCURRENCY,
        signal: controller.signal,
        upload: (batch, signal) => uploadImageBatch(projectId, batch, signal),
        onBatchDone: ({ files: batch, response }) => {
          // One state update per finished batch.
          setState((prev) => {
            if (response === undefined) {
              const failed = t("reject.requestFailed");
              return {
                ...prev,
                processed: prev.processed + batch.length,
                rejected: [
                  ...prev.rejected,
                  ...batch.map((file) => ({ name: file.name, reason: failed })),
                ],
                hadRequestFailures: true,
              };
            }
            let added = 0;
            let duplicates = 0;
            const newRejected: RejectedEntry[] = [];
            for (const result of response.results) {
              if (result.status === "added") {
                added += 1;
              } else if (result.status === "duplicate") {
                duplicates += 1;
              } else {
                // Server reasons are shown verbatim (P1 D-05).
                newRejected.push({ name: result.filename, reason: result.reason ?? "" });
              }
            }
            return {
              ...prev,
              processed: prev.processed + batch.length,
              added: prev.added + added,
              duplicates: prev.duplicates + duplicates,
              rejected: newRejected.length > 0 ? [...prev.rejected, ...newRejected] : prev.rejected,
            };
          });
        },
      })
        .then(async ({ cancelled }) => {
          runningRef.current = false;
          controllerRef.current = null;
          if (unmountedRef.current) {
            return;
          }
          setState((prev) => ({ ...prev, status: cancelled ? "cancelled" : "done" }));
          // Reset (never invalidate) the infinite query, once for the whole
          // upload: invalidation would refetch every page loaded so far.
          await queryClient.resetQueries({ queryKey: imageKeys.project(projectId) });
        })
        .catch(() => {
          runningRef.current = false;
          controllerRef.current = null;
        });
    },
    [projectId, queryClient, t],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const dismiss = useCallback(() => {
    if (!runningRef.current) {
      setState(IDLE);
    }
  }, []);

  const value = useMemo(
    () => ({ state, startUpload, cancel, dismiss }),
    [state, startUpload, cancel, dismiss],
  );
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUpload(): UploadContextValue {
  const value = useContext(UploadContext);
  if (value === null) {
    throw new Error("useUpload must be used inside an UploadProvider");
  }
  return value;
}
