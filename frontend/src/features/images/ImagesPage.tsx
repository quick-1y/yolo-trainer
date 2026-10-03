import { Alert, Box, Button, FileButton, Group, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import { imageKeys, uploadImageBatch, useImagesInfinite } from "../../api/images";
import type { UploadResult } from "../../api/images";
import type { Project } from "../../api/projects";
import { ImageGrid } from "./ImageGrid";

interface ProjectOutletContext {
  project: Project;
}

const MAX_FILES_PER_BATCH = 10;
const ACCEPT = "image/jpeg,image/png,image/webp,image/bmp";

function countStatuses(results: UploadResult[]) {
  return {
    added: results.filter((r) => r.status === "added").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    rejected: results.filter((r) => r.status === "rejected").length,
  };
}

export function ImagesPage() {
  const { t } = useTranslation(["images", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const queryClient = useQueryClient();
  const images = useImagesInfinite(project.id);
  const [uploading, setUploading] = useState(false);

  const items = useMemo(
    () => images.data?.pages.flatMap((page) => page.items) ?? [],
    [images.data],
  );
  const total = images.data?.pages[0]?.total ?? 0;

  async function handleFiles(files: File[]) {
    if (files.length === 0 || uploading) {
      return;
    }
    setUploading(true);
    const results: UploadResult[] = [];
    try {
      // Sequential batches: the api processes files one by one anyway, and
      // small batches keep each request well under the proxy body limit.
      for (let start = 0; start < files.length; start += MAX_FILES_PER_BATCH) {
        const batch = files.slice(start, start + MAX_FILES_PER_BATCH);
        const response = await uploadImageBatch(project.id, batch);
        results.push(...response.results);
      }
      notifications.show({
        color: "green",
        message: t("images:progress.counters", countStatuses(results)),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof ApiError ? error.message : String(error),
      });
    } finally {
      setUploading(false);
      // Reset (never invalidate) the infinite query: invalidation would
      // refetch every page loaded so far.
      await queryClient.resetQueries({ queryKey: imageKeys.project(project.id) });
    }
  }

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 92px)" }}>
      <Group justify="space-between" mb="md">
        <Group align="baseline" gap="sm">
          <Title order={2}>{t("images:page.title")}</Title>
          <Text size="sm" c="dark.1">
            {t("images:page.count", { count: total })}
          </Text>
        </Group>
        <FileButton onChange={(files) => void handleFiles(files)} accept={ACCEPT} multiple>
          {(props) => (
            <Button {...props} loading={uploading}>
              {t("images:upload.files")}
            </Button>
          )}
        </FileButton>
      </Group>
      <Box style={{ flex: 1, minHeight: 320 }}>
        {images.isPending ? (
          <Text c="dimmed">{t("common:loading")}</Text>
        ) : images.isError ? (
          <Alert color="red" title={t("common:error.title")}>
            {images.error instanceof ApiError ? images.error.message : String(images.error)}
          </Alert>
        ) : (
          <ImageGrid
            projectId={project.id}
            items={items}
            hasNextPage={images.hasNextPage}
            isFetchingNextPage={images.isFetchingNextPage}
            fetchNextPage={() => void images.fetchNextPage()}
          />
        )}
      </Box>
    </Box>
  );
}
