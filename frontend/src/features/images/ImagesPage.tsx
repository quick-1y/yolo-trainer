import { Alert, Box, Button, EmptyState, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAppConfig } from "../../api/config";
import { type ImageSort, useImagesInfinite } from "../../api/images";
import type { Project } from "../../api/projects";
import { editorPath, readGridParams } from "../editor/lib/urls";
import { DeleteImagesModal } from "./DeleteImagesModal";
import { ImageGrid } from "./ImageGrid";
import { ImagesToolbar } from "./ImagesToolbar";
import { SelectionBar } from "./SelectionBar";
import { StatusSummary } from "./StatusSummary";
import { UploadButtons } from "./UploadButtons";
import { useUpload } from "./UploadContext";
import { UploadDropzone } from "./UploadDropzone";
import { UploadPanel } from "./UploadPanel";

interface ProjectOutletContext {
  project: Project;
}

const SKELETON_TILES = 24;
// The server rejects a longer `q`, so the page never reads, sends or writes one (T3-04-01).
const MAX_QUERY_LENGTH = 255;

function normalizeQuery(value: string): string {
  return value.trim().slice(0, MAX_QUERY_LENGTH).trim();
}

/** First-page placeholder in the same flex-wrap layout as the real grid. */
function GridSkeleton() {
  return (
    <Box
      style={{
        display: "flex",
        flexWrap: "wrap",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {Array.from({ length: SKELETON_TILES }, (_, index) => (
        <Box key={index} p={4} style={{ width: 184, height: 208, flex: "none" }}>
          <Skeleton data-testid="grid-skeleton-tile" w={176} h={200} radius={8} />
        </Box>
      ))}
    </Box>
  );
}

export function ImagesPage() {
  const { t } = useTranslation(["images", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  // Sort and filename search live in the URL (D-03): reloadable, and the editor carries them
  // to its own URL so "← Images" returns to the same view. Writes use `replace`, so typing
  // never adds history entries.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const grid = readGridParams(searchParams);
  const sort: ImageSort = grid.sort ?? "newest";
  const query = normalizeQuery(grid.q ?? "");
  // Ids of the selected images (D-11) and the dialog that deletes them.
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Snapshot taken when the dialog opens, so its text survives the clearing of the selection.
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const images = useImagesInfinite(project.id, sort, query);
  const config = useAppConfig();
  const { state, cancel, dismiss } = useUpload();

  const items = useMemo(
    () => images.data?.pages.flatMap((page) => page.items) ?? [],
    [images.data],
  );
  const total = images.data?.pages[0]?.total ?? 0;

  // Read through a ref so the callbacks below keep a stable identity (ImageTile is memoized).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const gridRef = useRef({ sort, query });
  gridRef.current = { sort, query };
  const writeGrid = useCallback(
    (next: { sort: ImageSort; query: string }) => {
      const params = new URLSearchParams();
      if (next.sort === "name") {
        params.set("sort", "name");
      }
      if (next.query !== "") {
        params.set("q", next.query);
      }
      // Defaults are omitted; an unchanged URL is not written again (the toolbar echoes the
      // committed search once on mount).
      if (params.toString() !== searchParams.toString()) {
        setSearchParams(params, { replace: true });
      }
    },
    [searchParams, setSearchParams],
  );
  const handleSortChange = (value: ImageSort) =>
    writeGrid({ sort: value, query: gridRef.current.query });
  const handleSearchChange = (value: string) =>
    writeGrid({ sort: gridRef.current.sort, query: normalizeQuery(value) });
  // A tile opens the annotation editor, carrying the grid's sort and search so the editor
  // walks the same order and "← Images" comes back to this view (P2 D-10, D-03).
  const handleOpen = useCallback(
    (index: number) => {
      const image = itemsRef.current[index];
      if (image === undefined) {
        return;
      }
      const { sort: currentSort, query: currentQuery } = gridRef.current;
      navigate(editorPath(project.id, image.id, { sort: currentSort, q: currentQuery }));
    },
    [navigate, project.id],
  );
  // Index (in the loaded list) of the last tile toggled without Shift: the start of a Shift range.
  const anchorIndex = useRef<number | null>(null);
  const toggleSelect = useCallback((index: number, shiftKey: boolean) => {
    const current = itemsRef.current;
    const image = current[index];
    if (image === undefined) {
      return;
    }
    const anchor = anchorIndex.current;
    if (shiftKey && anchor !== null && anchor < current.length) {
      // Shift-click selects the whole range within the loaded list (D-11); the anchor stays put.
      const from = Math.min(anchor, index);
      const to = Math.max(anchor, index);
      setSelected((previous) => {
        const next = new Set(previous);
        for (const item of current.slice(from, to + 1)) {
          next.add(item.id);
        }
        return next;
      });
      return;
    }
    anchorIndex.current = index;
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(image.id)) {
        next.add(image.id);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    anchorIndex.current = null;
    setSelected((previous) => (previous.size === 0 ? previous : new Set()));
  }, []);
  const selecting = selected.size > 0;

  // A new search or sort starts from an empty selection.
  useEffect(() => {
    clearSelection();
  }, [sort, query, clearSelection]);

  // Esc clears the selection, but only when nothing else owns Esc: the delete dialog
  // closes itself first and keeps the selection.
  useEffect(() => {
    if (!selecting || deleteOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting, deleteOpen, clearSelection]);

  // Deleting every loaded image leaves an empty list while the server still has more pages:
  // pruneDeletedImages keeps next_cursor, and VirtuosoGrid's endReached never fires for zero
  // items, so load the next page here. Never during a fetch, and never after a failed load
  // (only the footer "Try again" fetches again, same rule as handleEndReached).
  const { fetchNextPage } = images;
  useEffect(() => {
    if (
      images.data !== undefined &&
      items.length === 0 &&
      images.hasNextPage &&
      !images.isFetching &&
      !images.isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [
    images.data,
    items.length,
    images.hasNextPage,
    images.isFetching,
    images.isFetchNextPageError,
    fetchNextPage,
  ]);
  const searching = query !== "";
  // Empty states only when the list is exhausted, not merely empty.
  const nothingLeft = items.length === 0 && !images.hasNextPage;

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100dvh - 92px)",
      }}
    >
      <UploadDropzone />
      <Box mb="md">
        <Group justify="space-between">
          <Group align="baseline" gap="sm">
            <Title order={2}>{t("images:page.title")}</Title>
            <Text size="sm" c="dark.1">
              {searching
                ? t("images:page.countFiltered", { count: total })
                : t("images:page.count", { count: total })}
            </Text>
          </Group>
          <UploadButtons />
        </Group>
        <StatusSummary projectId={project.id} />
      </Box>
      {state.status !== "idle" && (
        <UploadPanel state={state} onCancel={cancel} onDismiss={dismiss} />
      )}
      {selecting && (
        <SelectionBar
          count={selected.size}
          onClear={clearSelection}
          onDelete={() => {
            setDeleteIds(Array.from(selected));
            setDeleteOpen(true);
          }}
        />
      )}
      {/* Kept mounted (hidden) while selecting, so a pending debounced search still commits. */}
      <Box display={selecting ? "none" : undefined}>
        <ImagesToolbar
          search={query}
          onSearchChange={handleSearchChange}
          sort={sort}
          onSortChange={handleSortChange}
        />
      </Box>
      <Box style={{ flex: 1, minHeight: 320 }}>
        {images.isPending ? (
          <GridSkeleton />
        ) : images.data === undefined ? (
          // A failed next page also flips isError, but keeps the loaded pages:
          // that case stays in the grid and shows the inline footer error.
          <Alert color="red" title={t("common:error.title")}>
            <Stack gap={8} align="flex-start">
              <Text size="sm">
                {images.error instanceof ApiError ? images.error.message : String(images.error)}
              </Text>
              <Button
                variant="light"
                color="red"
                size="compact-sm"
                onClick={() => void images.refetch()}
              >
                {t("common:retry")}
              </Button>
            </Stack>
          </Alert>
        ) : nothingLeft && searching ? (
          <EmptyState
            title={t("images:noResults.title")}
            description={t("images:noResults.body", { query })}
            py={64}
          >
            <EmptyState.Actions>
              <Button variant="default" onClick={() => handleSearchChange("")}>
                {t("images:noResults.clear")}
              </Button>
            </EmptyState.Actions>
          </EmptyState>
        ) : nothingLeft ? (
          <EmptyState title={t("images:empty.title")} description={t("images:empty.body")} py={64}>
            {config.data !== undefined && (
              <EmptyState.Description>
                {t("images:empty.hint", { max: config.data.max_upload_mb })}
              </EmptyState.Description>
            )}
            <EmptyState.Actions>
              <UploadButtons />
            </EmptyState.Actions>
          </EmptyState>
        ) : (
          <ImageGrid
            // A new query always starts at the top of the grid.
            key={`${sort}|${query}`}
            projectId={project.id}
            items={items}
            onOpen={handleOpen}
            selected={selected}
            onToggleSelect={toggleSelect}
            hasNextPage={images.hasNextPage}
            isFetchingNextPage={images.isFetchingNextPage}
            isFetchNextPageError={images.isFetchNextPageError}
            fetchNextPage={() => void images.fetchNextPage()}
          />
        )}
      </Box>
      <DeleteImagesModal
        projectId={project.id}
        ids={deleteIds}
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={clearSelection}
      />
    </Box>
  );
}
