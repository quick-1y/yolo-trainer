import { Alert, Button, Group, Modal, SegmentedControl, Textarea, TextInput } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import { useCreateProject } from "../../api/projects";
import type { TaskType } from "../../api/projects";

interface CreateProjectModalProps {
  opened: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ opened, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation(["projects", "common"]);
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("detect");
  const [description, setDescription] = useState("");

  const errorMessage =
    createProject.error instanceof ApiError ? createProject.error.message : null;

  function reset() {
    setName("");
    setTaskType("detect");
    setDescription("");
    createProject.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createProject.mutate(
      {
        name,
        task_type: taskType,
        description: description.trim() === "" ? null : description,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
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
          required
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
          <Button type="submit" loading={createProject.isPending}>
            {t("projects:modal.submit")}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
