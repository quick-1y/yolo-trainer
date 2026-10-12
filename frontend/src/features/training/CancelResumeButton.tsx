import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { useCancelRun } from "../../api/training";
import type { RunDetail } from "../../api/training";

interface CancelResumeButtonProps {
  projectId: number;
  run: RunDetail;
}

/**
 * "Cancel resume" for a queued run that was resumed: it takes the run back to `cancelled` and
 * keeps its checkpoint, charts and counters, so it needs no confirmation (the destructive
 * "Remove from queue" is never offered for such a run, T-05-21). A rejection (the worker claimed
 * the run first, say) shows a red notification with the API message and changes nothing.
 */
export function CancelResumeButton({ projectId, run }: CancelResumeButtonProps) {
  const { t } = useTranslation(["training", "common"]);
  const cancel = useCancelRun(projectId);
  // A ref blocks a rapid second click before React re-renders the loading state.
  const isSubmittingRef = useRef(false);

  function handleClick() {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    cancel.mutate(run.id, {
      onSuccess: () => {
        isSubmittingRef.current = false;
        notifications.show({ color: "green", message: t("training:run.cancelResume.done") });
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
      variant="default"
      loading={cancel.isPending}
      style={{ flexShrink: 0 }}
      onClick={handleClick}
    >
      {t("training:run.cancelResume.open")}
    </Button>
  );
}
