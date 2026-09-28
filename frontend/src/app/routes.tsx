import { Navigate, Route, Routes } from "react-router-dom";

import { ProjectsPage } from "../features/projects/ProjectsPage";
import { AppLayout } from "./AppLayout";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
      </Route>
    </Routes>
  );
}
