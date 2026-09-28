import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useUpdateProject } from "../../api/projects";
import type { Project } from "../../api/projects";
import { DeleteProjectModal } from "./DeleteProjectModal";

interface ProjectOutletContext {
  project: Project;
}

// Mirrors the server-side limit (schemas.ProjectName) - client rules are UX
// only, the server is the authority (D-05).
const MAX_NAME_LENGTH = 100;

export function ProjectSettingsPage() {
  const { t } = useTranslation(["project", "projects", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const updateProject = useUpdateProject(project.id);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Re-sync local form state whenever the underlying record changes (e.g.
  // after a successful save refetches the project under its new name).
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setValidationError(null);
  }, [project.id, project.name, project.description]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const currentDescription = project.description ?? "";
  const hasChanges = trimmedName !== project.name || trimmedDescription !== currentDescription;

  const apiErrorMessage =
    updateProject.error instanceof ApiError ? updateProject.error.message : null;
  const errorMessage = validationError ?? apiErrorMessage;

  function validate(): string | null {
    if (trimmedName === "") {
      return t("project:settings.validation.nameRequired");
    }
    // Count Unicode code points, matching the server's `len()` on the
    // trimmed name.
    if (Array.from(trimmedName).length > MAX_NAME_LENGTH) {
      return t("project:settings.validation.nameTooLong");
    }
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);

    // Only send fields that actually changed - task_type is never included,
    // it has no input and cannot be part of this form (D-09).
    const payload: { name?: string; description?: string | null } = {};
    if (trimmedName !== project.name) {
      payload.name = trimmedName;
    }
    if (trimmedDescription !== currentDescription) {
      payload.description = trimmedDescription === "" ? null : trimmedDescription;
    }
    if (Object.keys(payload).length === 0) {
      return;
    }
    updateProject.mutate(payload);
  }

  return (
    <Stack>
      <Title order={2}>{project.name}</Title>
      <Text c="dimmed">{t("project:settings.title")}</Text>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack>
          <Title order={4}>{t("project:settings.general")}</Title>
          <TextInput
            label={t("project:settings.name")}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Textarea
            label={t("project:settings.description")}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Box>
            <Text size="sm" fw={500}>
              {t("project:settings.taskType")}
            </Text>
            <Group gap="xs" mt={4}>
              <Badge variant="light">{t(`projects:taskType.${project.task_type}`)}</Badge>
              <Text size="xs" c="dimmed">
                {t("project:settings.taskTypeLocked")}
              </Text>
            </Group>
          </Box>
          {errorMessage ? (
            <Alert color="red" title={t("common:error.title")}>
              {errorMessage}
            </Alert>
          ) : null}
          <Group justify="flex-end" gap="sm">
            {updateProject.isSuccess && !hasChanges ? (
              <Text size="sm" c="teal">
                {t("project:settings.saved")}
              </Text>
            ) : null}
            <Button
              type="submit"
              disabled={!hasChanges || updateProject.isPending}
              loading={updateProject.isPending}
            >
              {t("project:settings.save")}
            </Button>
          </Group>
        </Stack>
      </Box>
      <Divider mt="lg" />
      <Stack>
        <Title order={4} c="red">
          {t("project:delete.dangerZone")}
        </Title>
        <Group>
          <Button color="red" variant="outline" onClick={openDeleteModal}>
            {t("project:delete.button")}
          </Button>
        </Group>
      </Stack>
      <DeleteProjectModal
        project={project}
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
      />
    </Stack>
  );
}
