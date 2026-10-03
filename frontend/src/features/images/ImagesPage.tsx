import { Alert, Box, Button, EmptyState, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAppConfig } from "../../api/config";
import { useImagesInfinite } from "../../api/images";
import type { Project } from "../../api/projects";
import { ImageGrid } from "./ImageGrid";
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
    <Box style={{ display: "flex", flexWrap: "wrap", overflow: "hidden", height: "100%" }}>
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
  const images = useImagesInfinite(project.id);
  const config = useAppConfig();
  const { state, cancel, dismiss } = useUpload();

  const items = useMemo(
    () => images.data?.pages.flatMap((page) => page.items) ?? [],
    [images.data],
  );
  const total = images.data?.pages[0]?.total ?? 0;

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 92px)" }}>
      <UploadDropzone />
      <Group justify="space-between" mb="md">
        <Group align="baseline" gap="sm">
          <Title order={2}>{t("images:page.title")}</Title>
          <Text size="sm" c="dark.1">
            {t("images:page.count", { count: total })}
          </Text>
        </Group>
        <UploadButtons />
      </Group>
      {state.status !== "idle" && (
        <UploadPanel state={state} onCancel={cancel} onDismiss={dismiss} />
      )}
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
        ) : items.length === 0 ? (
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
            projectId={project.id}
            items={items}
            hasNextPage={images.hasNextPage}
            isFetchingNextPage={images.isFetchingNextPage}
            isFetchNextPageError={images.isFetchNextPageError}
            fetchNextPage={() => void images.fetchNextPage()}
          />
        )}
      </Box>
    </Box>
  );
}
