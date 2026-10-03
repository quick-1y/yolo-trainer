import { Alert, Box, Group, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
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

export function ImagesPage() {
  const { t } = useTranslation(["images", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const images = useImagesInfinite(project.id);
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
