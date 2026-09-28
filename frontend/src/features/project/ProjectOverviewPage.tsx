import { Badge, Group, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import type { Project } from "../../api/projects";

interface ProjectOutletContext {
  project: Project;
}

export function ProjectOverviewPage() {
  const { t, i18n } = useTranslation(["project", "projects"]);
  const { project } = useOutletContext<ProjectOutletContext>();

  const createdAt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
    new Date(project.created_at),
  );

  return (
    <Stack>
      <Group>
        <Title order={2}>{project.name}</Title>
        <Badge variant="light">{t(`projects:taskType.${project.task_type}`)}</Badge>
      </Group>
      <Text>{project.description ?? t("overview.noDescription")}</Text>
      <Text size="sm" c="dimmed">
        {t("overview.createdAt", { date: createdAt })}
      </Text>
      <Text c="dimmed">{t("overview.emptyHint")}</Text>
    </Stack>
  );
}
