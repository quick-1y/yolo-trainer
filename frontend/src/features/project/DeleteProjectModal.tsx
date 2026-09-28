import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useDeleteProject } from "../../api/projects";
import type { Project } from "../../api/projects";

interface DeleteProjectModalProps {
  project: Project;
  opened: boolean;
  onClose: () => void;
}

/**
 * GitHub-style typed-name delete confirmation (D-10). The confirm button
 * only enables on an exact, case-sensitive match of the project's name -
 * this is the ONLY path that can hard-delete a project from the UI.
 */
export function DeleteProjectModal({ project, opened, onClose }: DeleteProjectModalProps) {
  const { t } = useTranslation(["project", "projects", "common"]);
  const navigate = useNavigate();
  const deleteProject = useDeleteProject(project.id);

  const [typed, setTyped] = useState("");
  // A ref (not just derived state) so a rapid repeat Enter/click is blocked
  // synchronously, mirroring CreateProjectModal's submit-lock pattern.
  const isSubmittingRef = useRef(false);
  const isMatch = typed === project.name;

  function reset() {
    setTyped("");
    isSubmittingRef.current = false;
    deleteProject.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleConfirm() {
    if (!isMatch || isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;

    deleteProject.mutate(undefined, {
      onSuccess: () => {
        // Also covers the "already deleted elsewhere" case: useDeleteProject
        // treats a 404 on DELETE as a successful (idempotent) outcome.
        reset();
        onClose();
        navigate("/projects");
        notifications.show({
          color: "green",
          message: t("project:delete.done", { name: project.name }),
        });
      },
      onError: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleConfirm();
    }
  }

  const apiErrorMessage =
    deleteProject.error instanceof ApiError ? deleteProject.error.message : null;

  return (
    <Modal opened={opened} onClose={handleClose} title={t("project:delete.title")}>
      <Stack>
        <Text>{t("project:delete.warning", { name: project.name })}</Text>
        <TextInput
          label={t("project:delete.typeToConfirm", { name: project.name })}
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          data-autofocus
        />
        {apiErrorMessage ? (
          <Alert color="red" title={t("common:error.title")}>
            {apiErrorMessage}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose} type="button">
            {t("projects:modal.cancel")}
          </Button>
          <Button
            color="red"
            disabled={!isMatch || deleteProject.isPending}
            loading={deleteProject.isPending}
            onClick={handleConfirm}
          >
            {t("project:delete.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
