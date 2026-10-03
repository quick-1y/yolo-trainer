import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { Project } from "../../api/projects";
import { formatRelativeTime } from "../../lib/relativeTime";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t, i18n } = useTranslation("projects");

  return (
    <Card
      component={Link}
      to={`/projects/${project.id}`}
      withBorder
      padding="lg"
      radius="md"
      h="100%"
    >
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Text fw={600}>{project.name}</Text>
          <Badge variant="light">{t(`taskType.${project.task_type}`)}</Badge>
        </Group>
      </Card.Section>
      <Card.Section inheritPadding py="xs">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {formatRelativeTime(project.updated_at, i18n.language)}
          </Text>
          <Text size="sm" c="dark.1">
            {t("card.images", { count: project.image_count ?? 0 })}
          </Text>
        </Stack>
      </Card.Section>
    </Card>
  );
}
