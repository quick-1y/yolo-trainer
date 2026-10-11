import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import { useCancelRun } from "../../api/training";
import type { RunDetail } from "../../api/training";

interface CancelRunModalProps {
  projectId: number;
  run: RunDetail;
  opened: boolean;
  /** Called on every close; the run page re-fetches the run there. */
  onClose: () => void;
}

/** Confirmation for cancelling a running run (D-06, D-07): the epoch in progress is lost. */
export function CancelRunModal({ projectId, run, opened, onClose }: CancelRunModalProps) {
  const { t } = useTranslation(["training", "common"]);
  const cancel = useCancelRun(projectId);
  // A ref blocks a rapid second Enter/click before React re-renders the disabled state.
  const isSubmittingRef = useRef(false);
  const planned = run.epochs ?? run.settings.epochs;
  // The epoch in progress is the one after the last finished epoch, never above the total.
  const epoch = Math.min((run.epoch ?? 0) + 1, planned);

  function handleClose() {
    if (cancel.isPending) {
      return;
    }
    isSubmittingRef.current = false;
    cancel.reset();
    onClose();
  }

  function handleConfirm() {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    cancel.mutate(run.id, {
      onSuccess: () => {
        isSubmittingRef.current = false;
        cancel.reset();
        // The page stays where it is and shows "Cancelling…" until the run is cancelled.
        onClose();
      },
      onError: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  const errorMessage =
    cancel.error instanceof ApiError || cancel.error instanceof Error ? cancel.error.message : null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={440}
      title={<Text fz={16} fw={600}>{t("training:run.cancel.title")}</Text>}
      closeOnClickOutside={!cancel.isPending}
      closeOnEscape={!cancel.isPending}
    >
      <Stack gap={16}>
        <Stack gap={8}>
          <Text size="sm">{t("training:run.cancel.body", { epoch })}</Text>
          <Text fz={12} c="dark.1">
            {t("training:run.cancel.note")}
          </Text>
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
            disabled={cancel.isPending}
            type="button"
          >
            {t("training:run.cancel.keep")}
          </Button>
          <Button
            color="red"
            loading={cancel.isPending}
            disabled={cancel.isPending}
            onClick={handleConfirm}
          >
            {t("training:run.cancel.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
