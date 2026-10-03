import { Alert, Box, Button, EmptyState, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAppConfig } from "../../api/config";
import { type ImageSort, useImagesInfinite } from "../../api/images";
import type { Project } from "../../api/projects";
import { DeleteImagesModal } from "./DeleteImagesModal";
import { ImageGrid } from "./ImageGrid";
import { ImagesToolbar } from "./ImagesToolbar";
import { ImageViewerModal } from "./ImageViewerModal";
import { SelectionBar } from "./SelectionBar";
import { UploadButtons } from "./UploadButtons";
import { useUpload } from "./UploadContext";
import { UploadDropzone } from "./UploadDropzone";
import { UploadPanel } from "./UploadPanel";

interface ProjectOutletContext {
  project: Project;
}

const SKELETON_TILES = 24;

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
  const [sort, setSort] = useState<ImageSort>("newest");
  const [search, setSearch] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Ids of the selected images (D-11) and the dialog that deletes them.
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Snapshot taken when the dialog opens, so its text survives the clearing of the selection.
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  // Set when the viewer asked for the next page: advance once it is in `items`.
  const [advancePending, setAdvancePending] = useState(false);
  const query = search.trim();
  const images = useImagesInfinite(project.id, sort, query);
  const config = useAppConfig();
  const { state, cancel, dismiss } = useUpload();

  const items = useMemo(
    () => images.data?.pages.flatMap((page) => page.items) ?? [],
    [images.data],
  );
  const total = images.data?.pages[0]?.total ?? 0;

  // Read through a ref so the callback below keeps a stable identity (ImageTile is memoized).
  const itemsRef = useRef(items);
  itemsRef.current = items;
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

  // Esc clears the selection, but only when nothing else owns Esc: the viewer and the
  // delete dialog close themselves first and keep the selection.
  useEffect(() => {
    if (!selecting || viewerIndex !== null || deleteOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting, viewerIndex, deleteOpen, clearSelection]);

  useEffect(() => {
    if (!advancePending) {
      return;
    }
    if (viewerIndex !== null && viewerIndex + 1 < items.length) {
      setViewerIndex(viewerIndex + 1);
      setAdvancePending(false);
    } else if (images.isFetchNextPageError) {
      setAdvancePending(false);
    }
  }, [advancePending, viewerIndex, items.length, images.isFetchNextPageError]);

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
      <Group justify="space-between" mb="md">
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
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
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
              <Button variant="default" onClick={() => setSearch("")}>
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
            onOpen={setViewerIndex}
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
      {viewerIndex !== null && (
        <ImageViewerModal
          projectId={project.id}
          items={items}
          index={viewerIndex}
          total={total}
          hasNextPage={images.hasNextPage}
          isFetchingNextPage={images.isFetchingNextPage}
          onIndexChange={setViewerIndex}
          onRequestMore={() => {
            setAdvancePending(true);
            void images.fetchNextPage();
          }}
          onClose={() => {
            setViewerIndex(null);
            setAdvancePending(false);
          }}
        />
      )}
    </Box>
  );
}
