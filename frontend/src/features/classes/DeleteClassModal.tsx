import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { useDeleteClass } from "../../api/classes";
import type { ProjectClassItem } from "../../api/classes";
import { ApiError } from "../../api/client";

interface DeleteClassModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: number;
  projectClass: ProjectClassItem;
  /** True when other classes come after this one (their indices will shift up). */
  hasLaterClasses: boolean;
}

/**
 * Confirmation for deleting a class (D-16). Unlike a project, a class needs no
 * typed confirmation: a dialog with Cancel focused and a red confirm button.
 * This dialog is the only path that sends DELETE for a class.
 */
export function DeleteClassModal({
  opened,
  onClose,
  projectId,
  projectClass,
  hasLaterClasses,
}: DeleteClassModalProps) {
  const { t } = useTranslation(["classes", "projects", "common"]);
  const deleteClass = useDeleteClass(projectId);
  // A ref (not just isPending) blocks a rapid repeat click synchronously.
  const isSubmittingRef = useRef(false);

  function reset() {
    isSubmittingRef.current = false;
    deleteClass.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleConfirm() {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;

    deleteClass.mutate(projectClass.id, {
      onSuccess: () => {
        // Also covers "already deleted elsewhere": useDeleteClass resolves a 404.
        reset();
        onClose();
        notifications.show({
          color: "green",
          message: t("classes:delete.done", { name: projectClass.name }),
        });
      },
      onError: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  // The body is built here, in one place; the "N objects will be deleted"
  // sentence (P2 D-16) is a separate bold paragraph rendered below it.
  const sentences = [t("classes:delete.body", { name: projectClass.name })];
  if (hasLaterClasses) {
    sentences.push(t("classes:delete.shiftNote"));
  }

  const apiErrorMessage =
    deleteClass.error instanceof ApiError ? deleteClass.error.message : null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("classes:delete.title")}
    >
      <Stack>
        <Text>{sentences.join(" ")}</Text>
        {projectClass.object_count > 0 ? (
          <Text size="sm" fw={600}>
            {t("classes:delete.objects", { count: projectClass.object_count })}
          </Text>
        ) : null}
        {apiErrorMessage ? (
          <Alert color="red" title={t("common:error.title")}>
            {apiErrorMessage}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={handleClose}
            type="button"
            data-autofocus
          >
            {t("projects:modal.cancel")}
          </Button>
          <Button
            color="red"
            disabled={deleteClass.isPending}
            loading={deleteClass.isPending}
            onClick={handleConfirm}
          >
            {t("classes:delete.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
