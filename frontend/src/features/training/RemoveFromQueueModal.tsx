import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useRemoveQueuedRun } from "../../api/training";
import type { RunDetail } from "../../api/training";

interface RemoveFromQueueModalProps {
  projectId: number;
  run: RunDetail;
  opened: boolean;
  /** Called on every close; the run page re-fetches the run there. */
  onClose: () => void;
}

/** Confirmation for taking a queued run back out of the queue (D-11). */
export function RemoveFromQueueModal({ projectId, run, opened, onClose }: RemoveFromQueueModalProps) {
  const { t } = useTranslation(["training", "projects", "common"]);
  const navigate = useNavigate();
  const remove = useRemoveQueuedRun(projectId);
  // A ref blocks a rapid second Enter/click before React re-renders the disabled state.
  const isSubmittingRef = useRef(false);

  function handleClose() {
    if (remove.isPending) {
      return;
    }
    isSubmittingRef.current = false;
    remove.reset();
    onClose();
  }

  function handleConfirm() {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    remove.mutate(run.id, {
      onSuccess: () => {
        isSubmittingRef.current = false;
        remove.reset();
        navigate("..", { relative: "path" });
        notifications.show({
          color: "green",
          message: t("training:run.remove.done", { name: run.name }),
        });
      },
      onError: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  const errorMessage =
    remove.error instanceof ApiError || remove.error instanceof Error ? remove.error.message : null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={440}
      title={<Text fz={16} fw={600}>{t("training:run.remove.title")}</Text>}
      closeOnClickOutside={!remove.isPending}
      closeOnEscape={!remove.isPending}
    >
      <Stack>
        <Text size="sm">{t("training:run.remove.body", { name: run.name })}</Text>
        {errorMessage !== null ? (
          <Alert color="red" title={t("common:error.title")}>
            {errorMessage}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button
            variant="default"
            data-autofocus
            onClick={handleClose}
            disabled={remove.isPending}
            type="button"
          >
            {t("projects:modal.cancel")}
          </Button>
          <Button
            color="red"
            loading={remove.isPending}
            disabled={remove.isPending}
            onClick={handleConfirm}
          >
            {t("training:run.remove.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
