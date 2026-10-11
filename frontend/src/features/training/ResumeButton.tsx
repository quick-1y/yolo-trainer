import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { useResumeRun } from "../../api/training";
import type { RunDetail } from "../../api/training";

interface ResumeButtonProps {
  projectId: number;
  run: RunDetail;
  /** The id of the visible text that says why the button is disabled (set by the run page). */
  describedBy?: string;
}

/**
 * "Resume training" for an interrupted, cancelled or failed run (D-09, D-10). It has no
 * confirmation: resuming only queues the run, with the same settings. Filled for interrupted and
 * cancelled runs, `default` for a failed one so a persistent cause (out of memory) does not invite
 * a blind retry. A rejection shows a red notification with the API message and changes nothing.
 */
export function ResumeButton({ projectId, run, describedBy }: ResumeButtonProps) {
  const { t } = useTranslation(["training", "common"]);
  const resume = useResumeRun(projectId);
  // A ref blocks a rapid second click before React re-renders the loading state.
  const isSubmittingRef = useRef(false);

  function handleClick() {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    resume.mutate(run.id, {
      onSuccess: () => {
        isSubmittingRef.current = false;
        notifications.show({
          color: "green",
          message: t("training:run.resume.done", { name: run.name }),
        });
      },
      onError: (error) => {
        isSubmittingRef.current = false;
        notifications.show({
          color: "red",
          title: t("common:error.title"),
          message: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  return (
    <Button
      variant={run.status === "failed" ? "default" : "filled"}
      disabled={!run.can_resume}
      loading={resume.isPending}
      aria-describedby={describedBy}
      // The run name shrinks first (the title has its own ellipsis); the action keeps its width.
      style={{ flexShrink: 0 }}
      onClick={handleClick}
    >
      {t("training:run.resume.open")}
    </Button>
  );
}
