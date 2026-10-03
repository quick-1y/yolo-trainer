import { Navigate, Route, Routes } from "react-router-dom";

import { ImagesPage } from "../features/images/ImagesPage";
import { NotFoundPage } from "../features/NotFoundPage";
import { ProjectLayout } from "../features/project/ProjectLayout";
import { ProjectOverviewPage } from "../features/project/ProjectOverviewPage";
import { ProjectSettingsPage } from "../features/project/ProjectSettingsPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { AppLayout } from "./AppLayout";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="images" element={<ImagesPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
