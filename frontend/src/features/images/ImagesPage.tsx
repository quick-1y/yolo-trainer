import { Alert, Box, Button, FileButton, Group, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAppConfig } from "../../api/config";
import { imageKeys, uploadImageBatch, useImagesInfinite } from "../../api/images";
import type { UploadResult } from "../../api/images";
import type { Project } from "../../api/projects";
import { classifyFiles } from "../../lib/imageFiles";
import { planBatches, runUploadQueue } from "../../lib/uploadQueue";
import { ImageGrid } from "./ImageGrid";

interface ProjectOutletContext {
  project: Project;
}

function countStatuses(results: UploadResult[]) {
  return {
    added: results.filter((r) => r.status === "added").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    rejected: results.filter((r) => r.status === "rejected").length,
  };
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/bmp";
const CONCURRENCY = 3;

export function ImagesPage() {
  const { t } = useTranslation(["images", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const queryClient = useQueryClient();
  const images = useImagesInfinite(project.id);
  const config = useAppConfig();
  const [uploading, setUploading] = useState(false);

  const items = useMemo(
    () => images.data?.pages.flatMap((page) => page.items) ?? [],
    [images.data],
  );
  const total = images.data?.pages[0]?.total ?? 0;

  async function handleFiles(files: File[]) {
    if (files.length === 0 || uploading || config.data === undefined) {
      return;
    }
    setUploading(true);
    const { accepted, rejected } = classifyFiles(files, {
      maxUploadBytes: config.data.max_upload_bytes,
      acceptedExtensions: config.data.accepted_extensions,
    });
    // Counters only - never per-file React state (D-04).
    const counters = { added: 0, duplicates: 0, rejected: rejected.length };
    try {
      await runUploadQueue({
        batches: planBatches(accepted, config.data.max_upload_bytes),
        concurrency: CONCURRENCY,
        signal: new AbortController().signal,
        upload: (batch, signal) => uploadImageBatch(project.id, batch, signal),
        onBatchDone: ({ files: batch, response }) => {
          if (response === undefined) {
            counters.rejected += batch.length;
            return;
          }
          const statuses = countStatuses(response.results);
          counters.added += statuses.added;
          counters.duplicates += statuses.duplicates;
          counters.rejected += statuses.rejected;
        },
      });
      notifications.show({
        color: "green",
        message: t("images:progress.counters", counters),
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
            <Button {...props} loading={uploading} disabled={config.data === undefined}>
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
