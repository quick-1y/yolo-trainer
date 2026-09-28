import { Alert, Box, Group, NavLink, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useProject } from "../../api/projects";
import { ProjectNotFound } from "./ProjectNotFound";

interface SectionLink {
  key: string;
  to: string;
  labelKey: string;
}

// Later plans append entries to this array as their sections land
// (D-11: no links to sections that do not exist yet).
const SECTIONS: SectionLink[] = [{ key: "overview", to: ".", labelKey: "project:nav.overview" }];

export function ProjectLayout() {
  const { t } = useTranslation(["project", "common"]);
  const params = useParams<{ projectId: string }>();
  const parsedId = Number.parseInt(params.projectId ?? "", 10);
  const isValidId = Number.isFinite(parsedId) && parsedId > 0;
  const query = useProject(isValidId ? parsedId : null);

  if (!isValidId) {
    return <ProjectNotFound />;
  }

  if (query.isPending) {
    return <Text c="dimmed">{t("common:loading")}</Text>;
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <ProjectNotFound />;
    }
    return (
      <Alert color="red" title={t("common:error.title")}>
        {query.error instanceof ApiError ? query.error.message : String(query.error)}
      </Alert>
    );
  }

  return (
    <Group align="flex-start" gap="xl" wrap="nowrap">
      <Stack w={200} gap={4}>
        <NavLink component={Link} to="/projects" label={`← ${t("nav.back")}`} />
        {SECTIONS.map((section) => (
          <NavLink
            key={section.key}
            component={Link}
            to={`/projects/${parsedId}`}
            label={t(section.labelKey)}
            active
            variant="light"
          />
        ))}
      </Stack>
      <Box style={{ flex: 1 }}>
        <Outlet context={{ project: query.data }} />
      </Box>
    </Group>
  );
}
