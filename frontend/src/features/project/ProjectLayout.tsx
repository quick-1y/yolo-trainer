import { Alert, Box, Group, Loader, NavLink, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useProject } from "../../api/projects";
import { UploadProvider, useUpload } from "../images/UploadContext";
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
  { key: "images", to: "images", labelKey: "project:nav.images" },
  { key: "classes", to: "classes", labelKey: "project:nav.classes" },
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

  // Per-section matching: "overview" lives at the project's index route and
  // is active only on the exact project path; every other section is active
  // when the path starts with its own sub-path.
  const projectBase = `/projects/${parsedId}`;
  const pathname = location.pathname.replace(/\/+$/, "");
  const isActive = (section: SectionLink) =>
    section.to === "."
      ? pathname === projectBase
      : pathname.startsWith(`${projectBase}/${section.to}`);

  return (
    <UploadProvider key={parsedId} projectId={parsedId}>
      <Group align="flex-start" gap="xl" wrap="nowrap">
        <ProjectSidebar projectBase={projectBase} isActive={isActive} />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Outlet context={{ project: query.data }} />
        </Box>
      </Group>
    </UploadProvider>
  );
}

interface ProjectSidebarProps {
  projectBase: string;
  isActive: (section: SectionLink) => boolean;
}

function ProjectSidebar({ projectBase, isActive }: ProjectSidebarProps) {
  const { t } = useTranslation("project");
  const { state } = useUpload();
  const uploading = state.status === "running";

  return (
    <Stack w={200} gap={4}>
      <NavLink component={Link} to="/projects" label={`← ${t("nav.back")}`} />
      {SECTIONS.map((section) => (
        <NavLink
          key={section.key}
          component={Link}
          to={section.to === "." ? projectBase : `${projectBase}/${section.to}`}
          label={t(section.labelKey)}
          active={isActive(section)}
          variant="light"
          rightSection={
            section.key === "images" && uploading ? (
              <Loader size={16} data-testid="images-nav-loader" />
            ) : undefined
          }
        />
      ))}
    </Stack>
  );
}
