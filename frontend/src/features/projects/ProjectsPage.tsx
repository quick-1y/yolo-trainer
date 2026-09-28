import { Alert, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import { useProjects } from "../../api/projects";
import { NewProjectCard } from "./NewProjectCard";
import { ProjectCard } from "./ProjectCard";

export function ProjectsPage() {
  const { t } = useTranslation(["projects", "common"]);
  const { data: projects, isPending, isError, error } = useProjects();

  return (
    <Stack>
      <Title order={2}>{t("projects:page.title")}</Title>

      {isPending ? <Text c="dimmed">{t("common:loading")}</Text> : null}

      {isError ? (
        <Alert color="red" title={t("common:error.title")}>
          {error instanceof ApiError ? error.message : String(error)}
        </Alert>
      ) : null}

      {!isPending && !isError ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }}>
            <NewProjectCard />
            {projects?.map((project) => <ProjectCard key={project.id} project={project} />)}
          </SimpleGrid>
          {projects?.length === 0 ? (
            <Text c="dimmed">{t("projects:emptyState.hint")}</Text>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
