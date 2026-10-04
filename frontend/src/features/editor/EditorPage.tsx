import { Alert, Box, Button, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "zustand";

import {
  annotationKeys,
  createAnnotationSender,
  useAnnotations,
} from "../../api/annotations";
import { ApiError } from "../../api/client";
import { type ProjectClassItem, classKeys, useClasses } from "../../api/classes";
import { fileUrl, imageKeys, useImage, useNeighbors } from "../../api/images";
import { useProject } from "../../api/projects";
import { ProjectNotFound } from "../project/ProjectNotFound";
import { ConflictBanner } from "./ConflictBanner";
import { EditorTopBar } from "./EditorTopBar";
import { ClassPanel } from "./ClassPanel";
import { LeaveDialog } from "./LeaveDialog";
import { ObjectList } from "./ObjectList";
import { ToolBar } from "./ToolBar";
import { AnnotationCanvas, type AnnotationCanvasHandle } from "./canvas/AnnotationCanvas";
import { useLoadedImage } from "./canvas/useLoadedImage";
import { newId } from "./lib/ids";
import { editorPath, imagesPath, readGridParams } from "./lib/urls";
import type { NormBox } from "./lib/geometry";
import type { Saver } from "./store/annotationSaver";
import { type EditorDoc, MAX_BOXES, createEditorStore, docFromSet } from "./store/annotationStore";
import { useEditorUi } from "./store/editorUiStore";
import { type EditorEntry, discardEditor, getEditor } from "./store/storeRegistry";
import { EditorModalGateContext, useEditorHotkeys } from "./useEditorHotkeys";
import { useEditorNavigation } from "./useEditorNavigation";
import { useNextUnannotated } from "./useNextUnannotated";

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

/** The API's own message, else the fallback (a network failure has nothing readable to show). */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const EMPTY_DOC: EditorDoc = { boxes: [], isBackground: false, isReviewed: false };

/** A saver that never saves, for the frame shown while an image's annotations did not load. */
const INERT_SAVER: Saver = {
  schedule: () => {},
  flush: async () => "saved",
  isDirty: () => false,
  version: () => 0,
  dispose: () => {},
};

/**
 * A store nobody can write to and nothing saves, so the editor frame (top bar, tools, class
 * panel) can render without a document. It is never registered: it must not look like a clean
 * copy of an image that has annotations on the server.
 */
function createInertEntry(): EditorEntry {
  return { store: createEditorStore(EMPTY_DOC, 0), saver: INERT_SAVER, handlers: {} };
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
  const setVersion = set?.version;
  // One retained store + saver per image (D-10). The registry keeps an entry that holds
  // unsaved work whatever the fetched set says, so a refetch never replaces live edits; a clean
  // entry whose version differs from the server's is rebuilt (another tab saved: Pitfall 14).
  // Own saves patch the cached set to the version the store already holds, so they change
  // nothing here.
  const entry = useMemo(
    () =>
      set === undefined
        ? null
        : getEditor(
            { projectId, imageId },
            { doc: docFromSet(set), version: set.version },
            createAnnotationSender(queryClient, projectId, imageId),
          ),
    [hasSet, setVersion, projectId, imageId, queryClient],
  );

  // Rebuild this image from the server: its entry (history, pending edits) is dropped and its
  // annotation set starts again from nothing, so the page cannot rebuild from a stale cached copy.
  const resyncAnnotations = useCallback(() => {
    discardEditor({ projectId, imageId });
    void queryClient.resetQueries({
      queryKey: annotationKeys.set(projectId, imageId),
      exact: true,
    });
  }, [projectId, imageId, queryClient]);

  // The saver reports what the server refused through the entry; the entry outlives this page,
  // so the callbacks are registered while it is open and cleared when it closes.
  useEffect(() => {
    if (entry === null) {
      return undefined;
    }
    // 422: show the server's message, then resync classes and annotations (T3-12-04).
    entry.handlers.onRejected = (error) => {
      notifications.show({ color: "red", message: error.message });
      void queryClient.invalidateQueries({ queryKey: classKeys.list(projectId) });
      resyncAnnotations();
    };
    // 404: the image is gone; nothing can be saved for it, so the entry stops guarding the tab
    // and the refetched detail shows the not-found view.
    entry.handlers.onGone = () => {
      discardEditor({ projectId, imageId });
      void queryClient.invalidateQueries({ queryKey: imageKeys.detail(projectId, imageId) });
    };
    return () => {
      entry.handlers.onRejected = undefined;
      entry.handlers.onGone = undefined;
    };
  }, [entry, projectId, imageId, queryClient, resyncAnnotations]);

  const inertEntry = useMemo(createInertEntry, []);

  // Reload after a 409 (D-12): drop the local history and take the server's version.
  const reloadImage = useCallback(() => {
    resyncAnnotations();
    void queryClient.invalidateQueries({ queryKey: imageKeys.detail(projectId, imageId) });
  }, [resyncAnnotations, queryClient, projectId, imageId]);

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
  // The project failing is not about this image: it replaces the whole editor.
  if (project.error) {
    return (
      <FullScreen>
        <Alert color="red" title={t("common:error.title")}>
          <Stack gap={8} align="flex-start">
            <Text size="sm">{errorMessage(project.error, t("loadError.body"))}</Text>
            <Button size="compact-sm" variant="light" onClick={() => void project.refetch()}>
              {t("common:retry")}
            </Button>
          </Stack>
        </Alert>
      </FullScreen>
    );
  }
  if (project.isPending) {
    return (
      <FullScreen>
        <Loader size={32} />
      </FullScreen>
    );
  }
  // A failed image or annotation request (data missing, not just a failed refetch) keeps the
  // editor frame - above all the top bar's navigation - and shows the failure over the canvas.
  // A classes failure is shown inside the class panel instead.
  const imageFailure = image.data === undefined ? image.error : null;
  const setFailure = set === undefined ? annotations.error : null;
  const failure = imageFailure ?? setFailure ?? null;
  if (failure === null && (image.data === undefined || entry === null)) {
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
      filename={image.data?.filename ?? ""}
      imageSize={
        image.data === undefined ? null : { width: image.data.width, height: image.data.height }
      }
      classes={classes.data}
      classesError={classes.data === undefined ? classes.error : null}
      onRetryClasses={() => void classes.refetch()}
      entry={entry ?? inertEntry}
      documentLoaded={entry !== null}
      loadFailure={
        failure === null
          ? null
          : {
              message: errorMessage(failure, t("loadError.body")),
              retry: () => {
                if (imageFailure !== null) {
                  void image.refetch();
                }
                if (setFailure !== null) {
                  void annotations.refetch();
                }
              },
            }
      }
      onReload={reloadImage}
    />
  );
}

/** A failed image or annotation request, shown over the canvas with a way to ask again. */
interface LoadFailure {
  message: string;
  retry: () => void;
}

interface WorkspaceProps {
  projectId: number;
  imageId: number;
  filename: string;
  /** The stored (EXIF-oriented) size; null while the image detail is missing. */
  imageSize: { width: number; height: number } | null;
  /** Undefined while the classes load. */
  classes: ProjectClassItem[] | undefined;
  /** The classes request failed and there is no data to fall back on. */
  classesError: unknown;
  onRetryClasses: () => void;
  entry: EditorEntry;
  /** False when `entry` is the inert stand-in because the annotations did not load. */
  documentLoaded: boolean;
  loadFailure: LoadFailure | null;
  /** Reload after a conflict: refetch the image's annotations and drop its local history. */
  onReload: () => void;
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
  imageSize,
  classes,
  classesError,
  onRetryClasses,
  entry,
  documentLoaded,
  loadFailure,
  onReload,
}: WorkspaceProps) {
  const { t } = useTranslation(["editor", "common"]);
  const boxes = useStore(entry.store, (state) => state.doc.boxes);
  const saveState = useStore(entry.store, (state) => state.meta.saveState);
  const loaded = useLoadedImage(fileUrl(projectId, imageId), imageSize ?? undefined);
  // Read-only: a conflict (until Reload, D-12), an image the browser decodes at another size than
  // stored (boxes would land on the wrong pixels, Pitfall 4), or anything that did not load.
  // Nothing can change the document, and every reason is shown to the user.
  const conflict = saveState === "conflict";
  const mismatch = loaded.status === "mismatch";
  const imageFailed = loaded.status === "error";
  const readOnly = conflict || mismatch || imageFailed || loadFailure !== null;
  let readOnlyReason: string | undefined;
  if (conflict) {
    readOnlyReason = t("conflict.message");
  } else if (loadFailure !== null) {
    readOnlyReason = loadFailure.message;
  } else if (imageFailed) {
    readOnlyReason = t("loadError.body");
  } else if (mismatch) {
    readOnlyReason = t("canvas.mismatch.title");
  }
  const canvasRef = useRef<AnnotationCanvasHandle>(null);

  // Every way out of this image waits for its save (D-11); a second move is ignored meanwhile.
  const navigation = useEditorNavigation(projectId, imageId);
  const goNextUnannotated = useNextUnannotated(projectId, imageId, navigation);
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
    navigation.pending === null &&
    !readOnly;

  const handleCreate = (norm: NormBox) => {
    if (activeClass === undefined) {
      return;
    }
    if (entry.store.getState().doc.boxes.length >= MAX_BOXES) {
      // The server refuses more than MAX_BOXES per image: say so instead of drawing a box that
      // could never be saved.
      notifications.show({ color: "gray", message: t("canvas.limit", { max: MAX_BOXES }) });
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
      // A read-only editor cannot reclassify; picking the drawing class is UI state only.
      if (!readOnly) {
        entry.store.getState().setBoxClass(selectedId, target.id);
      }
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

  const canPickBox = classList.length > 0 && loaded.status === "loaded" && !readOnly;
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
      // The store ignores both while the image's state forbids them (D-13, D-14).
      reviewed: () => entry.store.getState().toggleReviewed(),
      background: () => entry.store.getState().toggleBackground(),
      deselect: () => {
        if (canvasRef.current?.isDrawing()) {
          canvasRef.current.cancelDraft();
        } else {
          select(null);
        }
      },
      prev: () => stepTo(prevId, "prev"),
      next: () => stepTo(nextId, "next"),
      nextUnannotated: goNextUnannotated,
      fit: () => canvasRef.current?.fit(),
      // Saves now instead of after the debounce; a conflict or a failure shows in the indicator.
      save: () => void entry.saver.flush(),
    },
    // While a move waits for the save, editing keys are off too: nothing new may slip in.
    // Read-only drops every editing row; navigation, view and save keep working.
    { enabled: openModals === 0 && navigation.pending === null, readOnly },
  );

  // One notice over the canvas, most fundamental first: a request that failed, the image that
  // would not load, the image the browser rotated differently. The conflict banner sits above.
  const alertStyle = { position: "absolute", top: conflict ? 56 : 16, left: 16, right: 16 } as const;
  let failureAlert: ReactNode = null;
  if (loadFailure !== null || imageFailed) {
    const retry = loadFailure !== null ? loadFailure.retry : loaded.retry;
    failureAlert = (
      <Alert color="red" title={t("common:error.title")} style={alertStyle}>
        <Stack gap={8} align="flex-start">
          <Text size="sm">{loadFailure !== null ? loadFailure.message : t("loadError.body")}</Text>
          <Button size="compact-sm" variant="light" color="red" onClick={retry}>
            {t("common:retry")}
          </Button>
        </Stack>
      </Alert>
    );
  } else if (mismatch) {
    failureAlert = (
      <Alert color="red" title={t("canvas.mismatch.title")} style={alertStyle}>
        {t("canvas.mismatch.body")}
      </Alert>
    );
  }

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
          onNextUnannotated={goNextUnannotated}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          documentLoaded={documentLoaded}
        />
        <ToolBar
          store={entry.store}
          hasClasses={classList.length > 0}
          imageLoaded={loaded.status === "loaded"}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
        />
        <Box style={{ minWidth: 0, minHeight: 0, position: "relative" }}>
          {conflict && <ConflictBanner onReload={onReload} />}
          {/* Without the stored size there is nothing to place boxes on: no canvas at all. */}
          {imageSize !== null && (
            <AnnotationCanvas
              ref={canvasRef}
              image={loaded.image}
              imgW={imageSize.width}
              imgH={imageSize.height}
              boxes={visibleBoxes}
              classColors={classColors}
              labels={labels}
              activeColor={activeClass?.color ?? "#FFFFFF"}
              tool={tool}
              selectedId={selectedId}
              hoveredId={hoveredId}
              canDraw={canDraw}
              noClasses={classes !== undefined && classes.length === 0}
              keyboardEnabled={openModals === 0}
              readOnly={readOnly}
              failed={imageFailed}
              onCreate={handleCreate}
              onSelect={select}
              onHover={hover}
              onChange={handleChange}
            />
          )}
          {failureAlert}
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
            store={documentLoaded ? entry.store : null}
            classes={classes}
            onReleaseFocus={() => canvasRef.current?.focus()}
            readOnly={readOnly}
          />
        </Box>
      </Box>
      <LeaveDialog
        opened={navigation.leave.open}
        retrying={navigation.leave.retrying}
        onRetry={() => void navigation.leave.retry()}
        onLeave={navigation.leave.leaveAnyway}
        onClose={navigation.leave.close}
      />
    </EditorModalGateContext>
  );
}
