import { Alert, Box, Button, Loader, Stack, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "zustand";

import { createAnnotationSender, useAnnotations } from "../../api/annotations";
import { ApiError } from "../../api/client";
import { type ProjectClassItem, useClasses } from "../../api/classes";
import { fileUrl, useImage, useNeighbors } from "../../api/images";
import { useProject } from "../../api/projects";
import { ProjectNotFound } from "../project/ProjectNotFound";
import { EditorTopBar } from "./EditorTopBar";
import { ClassPanel } from "./ClassPanel";
import { ObjectList } from "./ObjectList";
import { ToolBar } from "./ToolBar";
import { AnnotationCanvas, type AnnotationCanvasHandle } from "./canvas/AnnotationCanvas";
import { useLoadedImage } from "./canvas/useLoadedImage";
import { newId } from "./lib/ids";
import { editorPath, imagesPath, readGridParams } from "./lib/urls";
import type { NormBox } from "./lib/geometry";
import { docFromSet } from "./store/annotationStore";
import { useEditorUi } from "./store/editorUiStore";
import { type EditorEntry, getEditor } from "./store/storeRegistry";
import { EditorModalGateContext, useEditorHotkeys } from "./useEditorHotkeys";
import { useEditorNavigation } from "./useEditorNavigation";

const MATTE = "#141414";

function parseId(raw: string | undefined): number | null {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        height: "100dvh",
        background: MATTE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {children}
    </Box>
  );
}

function EditorNotFound({ projectId }: { projectId: number }) {
  const { t } = useTranslation("editor");
  return (
    <FullScreen>
      <Stack gap={8} align="center">
        <Text size="md" fw={600}>
          {t("notFound.title")}
        </Text>
        <Text size="sm" c="dark.1">
          {t("notFound.body")}
        </Text>
        <Button component={Link} to={imagesPath(projectId)} variant="light">
          {t("notFound.back")}
        </Button>
      </Stack>
    </FullScreen>
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : String(error);
}

/**
 * The full-screen editor route target. It lives OUTSIDE the app shell (no app
 * header, no project sidebar) and is lazy-loaded so konva stays out of the main bundle.
 */
export function EditorPage() {
  const params = useParams<{ projectId: string; imageId: string }>();
  const projectId = parseId(params.projectId);
  const imageId = parseId(params.imageId);

  if (projectId === null) {
    return (
      <FullScreen>
        <ProjectNotFound />
      </FullScreen>
    );
  }
  if (imageId === null) {
    return <EditorNotFound projectId={projectId} />;
  }
  return <LoadedEditor projectId={projectId} imageId={imageId} />;
}

function LoadedEditor({ projectId, imageId }: { projectId: number; imageId: number }) {
  const { t } = useTranslation(["editor", "common"]);
  const queryClient = useQueryClient();
  const project = useProject(projectId);
  const image = useImage(projectId, imageId);
  const annotations = useAnnotations(projectId, imageId);
  const classes = useClasses(projectId);

  const set = annotations.data;
  const hasSet = set !== undefined;
  // One retained store + saver per image (D-10). The registry ignores `init` when
  // an entry already exists, so a refetched set never replaces live edits.
  const entry = useMemo(
    () =>
      set === undefined
        ? null
        : getEditor(
            { projectId, imageId },
            { doc: docFromSet(set), version: set.version },
            createAnnotationSender(queryClient, projectId, imageId),
          ),
    // Keyed by presence of the set, not by every saved set.
    [hasSet, projectId, imageId, queryClient],
  );

  if (isNotFound(project.error)) {
    return (
      <FullScreen>
        <ProjectNotFound />
      </FullScreen>
    );
  }
  if (isNotFound(image.error) || isNotFound(annotations.error)) {
    return <EditorNotFound projectId={projectId} />;
  }
  // A classes failure is shown inside the class panel, so the rest of the editor stays usable.
  const failure = project.error ?? image.error ?? annotations.error;
  if (failure) {
    return (
      <FullScreen>
        <Alert color="red" title={t("common:error.title")}>
          <Stack gap={8} align="flex-start">
            <Text size="sm">{errorMessage(failure)}</Text>
            <Button
              size="compact-sm"
              variant="light"
              onClick={() => {
                void project.refetch();
                void image.refetch();
                void annotations.refetch();
              }}
            >
              {t("common:retry")}
            </Button>
          </Stack>
        </Alert>
      </FullScreen>
    );
  }
  if (project.isPending || image.data === undefined || entry === null) {
    return (
      <FullScreen>
        <Loader size={32} />
      </FullScreen>
    );
  }

  return (
    <Workspace
      projectId={projectId}
      imageId={imageId}
      filename={image.data.filename}
      imgW={image.data.width}
      imgH={image.data.height}
      classes={classes.data}
      classesError={classes.data === undefined ? classes.error : null}
      onRetryClasses={() => void classes.refetch()}
      entry={entry}
    />
  );
}

interface WorkspaceProps {
  projectId: number;
  imageId: number;
  filename: string;
  imgW: number;
  imgH: number;
  /** Undefined while the classes load. */
  classes: ProjectClassItem[] | undefined;
  /** The classes request failed and there is no data to fall back on. */
  classesError: unknown;
  onRetryClasses: () => void;
  entry: EditorEntry;
}

const CHROME = {
  background: "var(--mantine-color-dark-7)",
  minWidth: 0,
  minHeight: 0,
} as const;

function Workspace({
  projectId,
  imageId,
  filename,
  imgW,
  imgH,
  classes,
  classesError,
  onRetryClasses,
  entry,
}: WorkspaceProps) {
  const { t } = useTranslation(["editor", "common"]);
  const boxes = useStore(entry.store, (state) => state.doc.boxes);
  const loaded = useLoadedImage(fileUrl(projectId, imageId));
  const canvasRef = useRef<AnnotationCanvasHandle>(null);

  // Every way out of this image waits for its save (D-11); a second move is ignored meanwhile.
  const navigation = useEditorNavigation(projectId, imageId);
  const [searchParams] = useSearchParams();
  const grid = readGridParams(searchParams);
  const neighbors = useNeighbors(projectId, imageId, grid.sort, grid.q).data;
  const prevId = neighbors?.prev_id ?? null;
  const nextId = neighbors?.next_id ?? null;

  // Warm the browser cache with the neighbors' originals: stepping through images then shows
  // each one at once (the file route sends immutable cache headers). The images are kept in a
  // ref so the requests are not abandoned before they finish.
  const warmed = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    warmed.current = [prevId, nextId]
      .filter((id): id is number => id !== null)
      .map((id) => {
        const image = new Image();
        image.src = fileUrl(projectId, id);
        return image;
      });
  }, [projectId, prevId, nextId]);

  // Dialogs register here while open; every shortcut is off until they close (Pitfall 10).
  const [openModals, setOpenModals] = useState(0);
  const modalGate = useMemo(
    () => ({
      acquire: () => {
        setOpenModals((count) => count + 1);
        return () => setOpenModals((count) => Math.max(0, count - 1));
      },
    }),
    [],
  );

  const tool = useEditorUi((state) => state.tool);
  const rawSelectedId = useEditorUi((state) => state.selectedId);
  const hoveredId = useEditorUi((state) => state.hoveredId);
  const select = useEditorUi((state) => state.select);
  const setTool = useEditorUi((state) => state.setTool);
  const hover = useEditorUi((state) => state.hover);
  const activeClassId = useEditorUi((state) => state.activeClassId);
  const setActiveClass = useEditorUi((state) => state.setActiveClass);
  const hiddenIds = useEditorUi((state) => state.hiddenIds);

  // A new image starts with nothing selected or hovered (the tool is kept).
  useLayoutEffect(() => {
    useEditorUi.getState().resetForImage();
  }, [imageId]);

  const classList = classes ?? [];
  // One class is always active (D-05): the picked one, else the first by index. A deleted
  // active class and a project with a single class both fall back to the first.
  const activeClass = classList.find((item) => item.id === activeClassId) ?? classList[0];
  const classColors = useMemo(
    () => Object.fromEntries(classList.map((item) => [item.id, item.color])),
    // `classes` is the stable query data.
    [classes],
  );
  const labels = useMemo(
    () => Object.fromEntries(classList.map((item) => [item.id, item.name])),
    [classes],
  );
  // A selection whose box is gone (undo, delete) is no selection.
  const selectedId = boxes.some((box) => box.id === rawSelectedId) ? rawSelectedId : null;
  // An undo, redo or delete that removes the selected box also drops the stored
  // selection, so it cannot come back when a box with that id reappears.
  useEffect(() => {
    if (rawSelectedId !== null && selectedId === null) {
      select(null);
    }
  }, [rawSelectedId, selectedId, select]);
  // Neither the editor nor the API looks at the project's task type (D-18).
  const canDraw =
    tool === "box" &&
    loaded.status === "loaded" &&
    activeClass !== undefined &&
    navigation.pending === null;

  const handleCreate = (norm: NormBox) => {
    if (activeClass === undefined) {
      return;
    }
    entry.store.getState().createBox({ id: newId(), class_id: activeClass.id, ...norm });
  };

  // Saved by the registry subscription, like every other doc change (D-09).
  const handleChange = (id: string, geometry: NormBox) => {
    entry.store.getState().updateBox(id, geometry);
  };

  // With a box selected a class choice reclassifies that box and leaves the active class
  // alone (D-06); otherwise it picks the class to draw with (D-05). One path for the panel
  // rows and the digit keys.
  const chooseClass = (index: number) => {
    const target = classList[index];
    if (target === undefined) {
      return;
    }
    if (selectedId !== null) {
      entry.store.getState().setBoxClass(selectedId, target.id);
    } else {
      setActiveClass(target.id);
    }
  };

  // A hidden box is neither drawn nor hit-testable: the canvas is only given the rest.
  const visibleBoxes = useMemo(
    () => (hiddenIds.size === 0 ? boxes : boxes.filter((box) => !hiddenIds.has(box.id))),
    [boxes, hiddenIds],
  );

  // Boxes of each class on this image, for the class rows.
  const classCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const box of boxes) {
      counts[box.class_id] = (counts[box.class_id] ?? 0) + 1;
    }
    return counts;
  }, [boxes]);

  const canPickBox = classList.length > 0 && loaded.status === "loaded";
  const stepTo = (id: number | null, control: "prev" | "next") => {
    if (id !== null) {
      void navigation.goTo(editorPath(projectId, id, grid), control);
    }
  };
  // Handlers are read at key time, so they always see the current selection and tool.
  useEditorHotkeys(
    {
      select: () => setTool("select"),
      box: () => {
        if (canPickBox) {
          setTool("box");
        }
      },
      delete: () => {
        if (selectedId !== null) {
          entry.store.getState().deleteBox(selectedId);
          select(null);
        }
      },
      classDigit: (event) => chooseClass(Number.parseInt(event.code.slice("Digit".length), 10) - 1),
      undo: () => entry.store.temporal.getState().undo(),
      redo: () => entry.store.temporal.getState().redo(),
      deselect: () => {
        if (canvasRef.current?.isDrawing()) {
          canvasRef.current.cancelDraft();
        } else {
          select(null);
        }
      },
      prev: () => stepTo(prevId, "prev"),
      next: () => stepTo(nextId, "next"),
    },
    // While a move waits for the save, editing keys are off too: nothing new may slip in.
    { enabled: openModals === 0 && navigation.pending === null, readOnly: false },
  );

  return (
    <EditorModalGateContext value={modalGate}>
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "48px 1fr 320px",
          gridTemplateRows: "48px 1fr",
          height: "100dvh",
          overflow: "hidden",
          background: MATTE,
        }}
      >
        <EditorTopBar
          projectId={projectId}
          imageId={imageId}
          filename={filename}
          store={entry.store}
          navigation={navigation}
        />
        <ToolBar
          store={entry.store}
          hasClasses={classList.length > 0}
          imageLoaded={loaded.status === "loaded"}
        />
        <Box style={{ minWidth: 0, minHeight: 0, position: "relative" }}>
          <AnnotationCanvas
            ref={canvasRef}
            image={loaded.image}
            imgW={imgW}
            imgH={imgH}
            boxes={visibleBoxes}
            classColors={classColors}
            labels={labels}
            activeColor={activeClass?.color ?? "#FFFFFF"}
            tool={tool}
            selectedId={selectedId}
            hoveredId={hoveredId}
            canDraw={canDraw}
            noClasses={classes !== undefined && classes.length === 0}
            onCreate={handleCreate}
            onSelect={select}
            onHover={hover}
            onChange={handleChange}
          />
          {loaded.status === "error" && (
            <Alert
              color="red"
              title={t("common:error.title")}
              style={{ position: "absolute", top: 16, left: 16, right: 16 }}
            >
              {t("canvas.loadFailed")}
            </Alert>
          )}
        </Box>
        <Box
          style={{
            ...CHROME,
            borderLeft: "1px solid var(--mantine-color-dark-4)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <ClassPanel
            projectId={projectId}
            items={classes}
            error={classesError}
            onRetry={onRetryClasses}
            activeClassId={activeClass?.id}
            counts={classCounts}
            hasSelection={selectedId !== null}
            onChoose={chooseClass}
          />
          <ObjectList
            store={entry.store}
            classes={classes}
            onReleaseFocus={() => canvasRef.current?.focus()}
          />
        </Box>
      </Box>
    </EditorModalGateContext>
  );
}
