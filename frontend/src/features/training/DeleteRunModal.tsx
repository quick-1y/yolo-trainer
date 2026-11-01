import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useDeleteRun } from "../../api/training";
import type { RunDetail } from "../../api/training";

interface DeleteRunModalProps {
  projectId: number;
  run: RunDetail;
  opened: boolean;
  /** Called on every close; the run page re-fetches the run there. */
  onClose: () => void;
}

/**
 * Confirmation for the one-way hard delete of a finished run (D-15). The model sentence appears
 * only when the run has a model, because its deletion is the surprise (T-05-27).
 */
export function DeleteRunModal({ projectId, run, opened, onClose }: DeleteRunModalProps) {
  const { t } = useTranslation(["training", "common"]);
  const navigate = useNavigate();
  const remove = useDeleteRun(projectId);
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
          message: t("training:run.delete.done", { name: run.name }),
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
      title={
        <Text fz={16} fw={600}>
          {t("training:run.delete.title")}
        </Text>
      }
      closeOnClickOutside={!remove.isPending}
      closeOnEscape={!remove.isPending}
    >
      <Stack gap={16}>
        <Stack gap={8}>
          <Text size="sm">{t("training:run.delete.body", { name: run.name })}</Text>
          {run.model !== null ? (
            <Text size="sm" fw={600}>
              {t("training:run.delete.bodyModel", { model: run.model.name })}
            </Text>
          ) : null}
        </Stack>
        {errorMessage !== null ? (
          <Alert color="red" title={t("common:error.title")}>
            {errorMessage}
          </Alert>
        ) : null}
        <Group justify="flex-end" gap={8}>
          <Button
            variant="default"
            data-autofocus
            onClick={handleClose}
            disabled={remove.isPending}
            type="button"
          >
            {t("training:run.delete.keep")}
          </Button>
          <Button
            color="red"
            loading={remove.isPending}
            disabled={remove.isPending}
            onClick={handleConfirm}
          >
            {t("training:run.delete.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
