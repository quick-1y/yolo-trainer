import { Loader } from "@mantine/core";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { ClassesPage } from "../features/classes/ClassesPage";
import { ImagesPage } from "../features/images/ImagesPage";
import { NotFoundPage } from "../features/NotFoundPage";
import { ProjectLayout } from "../features/project/ProjectLayout";
import { ProjectOverviewPage } from "../features/project/ProjectOverviewPage";
import { ProjectSettingsPage } from "../features/project/ProjectSettingsPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { AppLayout } from "./AppLayout";

// The editor pulls in konva; loading it lazily keeps it out of the main bundle.
const EditorPage = lazy(() =>
  import("../features/editor/EditorPage").then((module) => ({ default: module.EditorPage })),
);

function EditorFallback() {
  return (
    <div
      style={{
        height: "100dvh",
        background: "#141414",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Loader size={32} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* A sibling of the AppLayout route, not a child: the editor is full screen,
          with no app header and no project sidebar (D-01). */}
      <Route
        path="/projects/:projectId/annotate/:imageId"
        element={
          <Suspense fallback={<EditorFallback />}>
            <EditorPage />
          </Suspense>
        }
      />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="images" element={<ImagesPage />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
