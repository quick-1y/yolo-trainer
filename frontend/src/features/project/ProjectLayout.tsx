import { Alert, Box, Group, NavLink, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";

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
const SECTIONS: SectionLink[] = [
  { key: "overview", to: ".", labelKey: "project:nav.overview" },
  { key: "settings", to: "settings", labelKey: "project:nav.settings" },
];

export function ProjectLayout() {
  const { t } = useTranslation(["project", "common"]);
  const params = useParams<{ projectId: string }>();
  const location = useLocation();
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

  // Only the "settings" section has its own sub-path today; every other
  // section (currently just "overview") lives at the project's index route,
  // so "not on /settings" is what marks it active (D-11: extend this as
  // more sections land instead of assuming exactly two).
  const isSettingsRoute = location.pathname.endsWith("/settings");

  return (
    <Group align="flex-start" gap="xl" wrap="nowrap">
      <Stack w={200} gap={4}>
        <NavLink component={Link} to="/projects" label={`← ${t("nav.back")}`} />
        {SECTIONS.map((section) => (
          <NavLink
            key={section.key}
            component={Link}
            to={
              section.to === "."
                ? `/projects/${parsedId}`
                : `/projects/${parsedId}/${section.to}`
            }
            label={t(section.labelKey)}
            active={section.key === "settings" ? isSettingsRoute : !isSettingsRoute}
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
