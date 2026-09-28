import { Alert, Button, Group, Modal, SegmentedControl, Textarea, TextInput } from "@mantine/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import { useCreateProject } from "../../api/projects";
import type { TaskType } from "../../api/projects";

interface CreateProjectModalProps {
  opened: boolean;
  onClose: () => void;
}

// Mirrors the server-side limits (schemas.ProjectName/ProjectDescription) -
// client rules are UX only, the server is the authority (D-05, T-03-01).
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;

export function CreateProjectModal({ opened, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation(["projects", "common"]);
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("detect");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // A ref (not React state) so a rapid repeat click is blocked synchronously,
  // regardless of when React commits the re-render that disables the button
  // (T-03-04: pending-state submit lock against double POSTs).
  const isSubmittingRef = useRef(false);

  const apiErrorMessage =
    createProject.error instanceof ApiError ? createProject.error.message : null;
  const errorMessage = validationError ?? apiErrorMessage;

  function reset() {
    setName("");
    setTaskType("detect");
    setDescription("");
    setValidationError(null);
    isSubmittingRef.current = false;
    createProject.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function validate(): string | null {
    if (name.trim() === "") {
      return t("projects:create.validation.nameRequired");
    }
    // Count Unicode code points (Array.from splits on code points, not UTF-16
    // units) so this matches the server's `len()` count on the trimmed name.
    if (Array.from(name.trim()).length > MAX_NAME_LENGTH) {
      return t("projects:create.validation.nameTooLong");
    }
    if (Array.from(description.trim()).length > MAX_DESCRIPTION_LENGTH) {
      return t("projects:create.validation.descriptionTooLong");
    }
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }

    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    isSubmittingRef.current = true;

    createProject.mutate(
      {
        name: name.trim(),
        task_type: taskType,
        description: description.trim() === "" ? null : description.trim(),
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
        onError: () => {
          isSubmittingRef.current = false;
        },
      },
    );
  }

  return (
    <Modal opened={opened} onClose={handleClose} title={t("projects:modal.title")}>
      <form onSubmit={handleSubmit}>
        <TextInput
          label={t("projects:modal.nameLabel")}
          placeholder={t("projects:modal.namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
        />
        <SegmentedControl
          mt="sm"
          fullWidth
          value={taskType}
          onChange={(value) => setTaskType(value as TaskType)}
          data={[
            { label: t("projects:taskType.detect"), value: "detect" },
            { label: t("projects:taskType.segment"), value: "segment" },
          ]}
        />
        <Textarea
          mt="sm"
          label={t("projects:modal.descriptionLabel")}
          placeholder={t("projects:modal.descriptionPlaceholder")}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          autosize
          minRows={2}
        />
        {errorMessage ? (
          <Alert mt="sm" color="red" title={t("common:error.title")}>
            {errorMessage}
          </Alert>
        ) : null}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose} type="button">
            {t("projects:modal.cancel")}
          </Button>
          <Button type="submit" loading={createProject.isPending} disabled={createProject.isPending}>
            {t("projects:modal.submit")}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
