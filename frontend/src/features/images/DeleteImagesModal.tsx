import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import { useDeleteImages } from "../../api/images";

interface DeleteImagesModalProps {
  projectId: number;
  ids: number[];
  opened: boolean;
  onClose: () => void;
  /** Called after the images were deleted (the page clears its selection). */
  onDeleted: () => void;
}

/**
 * Confirmation for hard-deleting the selected images (D-11). This dialog is
 * the only path that sends the delete request: nothing in the grid or the
 * selection bar deletes on its own. Focus starts on Cancel.
 */
export function DeleteImagesModal({
  projectId,
  ids,
  opened,
  onClose,
  onDeleted,
}: DeleteImagesModalProps) {
  const { t } = useTranslation(["images", "projects", "common"]);
  const deleteImages = useDeleteImages(projectId);
  // A ref so a rapid repeat click/Enter is blocked synchronously.
  const isSubmittingRef = useRef(false);
  const pending = deleteImages.isPending;

  function handleClose() {
    if (isSubmittingRef.current) {
      return;
    }
    deleteImages.reset();
    onClose();
  }

  function handleConfirm() {
    if (isSubmittingRef.current || ids.length === 0) {
      return;
    }
    isSubmittingRef.current = true;
    deleteImages.mutate(ids, {
      onSuccess: (result) => {
        isSubmittingRef.current = false;
        deleteImages.reset();
        onClose();
        onDeleted();
        notifications.show({
          color: "green",
          message: t("images:delete.done", { count: result.deleted }),
        });
      },
      onError: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  const apiErrorMessage =
    deleteImages.error instanceof ApiError ? deleteImages.error.message : null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("images:delete.title")}
      closeOnEscape={!pending}
      closeOnClickOutside={!pending}
      withCloseButton={!pending}
    >
      <Stack>
        <Text>{t("images:delete.body", { count: ids.length })}</Text>
        {apiErrorMessage ? (
          <Alert color="red" title={t("common:error.title")}>
            {apiErrorMessage}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button
            variant="default"
            type="button"
            disabled={pending}
            onClick={handleClose}
            data-autofocus
          >
            {t("projects:modal.cancel")}
          </Button>
          <Button color="red" disabled={pending} loading={pending} onClick={handleConfirm}>
            {t("images:delete.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
