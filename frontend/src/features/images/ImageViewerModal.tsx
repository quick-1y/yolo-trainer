import { ActionIcon, Group, Loader, Modal, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { fileUrl } from "../../api/images";
import type { ImageItem } from "../../api/images";
import classes from "./ImageViewerModal.module.css";

interface ImageViewerModalProps {
  projectId: number;
  items: ImageItem[];
  index: number;
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onIndexChange: (index: number) => void;
  onRequestMore: () => void;
  onClose: () => void;
}

type LoadStatus = "loading" | "loaded" | "error";

/**
 * The stage image with its own load state. The parent keys it by image id, so
 * every image starts in "loading" and a failure never sticks to the next one.
 */
function Stage({ src, filename }: { src: string; filename: string }) {
  const { t } = useTranslation("images");
  const [status, setStatus] = useState<LoadStatus>("loading");
  return (
    <>
      {status !== "error" && (
        <img
          className={classes.image}
          src={src}
          alt={filename}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
      {status === "loading" && (
        <div className={classes.center}>
          <Loader data-testid="viewer-loader" />
        </div>
      )}
      {status === "error" && (
        <div className={classes.center}>
          <Text size="md" c="dark.1">
            {t("viewer.loadFailed")}
          </Text>
        </div>
      )}
    </>
  );
}

/**
 * Full-size viewer (D-10). It is only mounted while an image is open, so the
 * original is requested for that one image and never for the grid.
 */
export function ImageViewerModal({
  projectId,
  items,
  index,
  total,
  hasNextPage,
  isFetchingNextPage,
  onIndexChange,
  onRequestMore,
  onClose,
}: ImageViewerModalProps) {
  const { t, i18n } = useTranslation("images");
  const image = items[index];
  const atEnd = index >= items.length - 1;

  const goPrev = () => {
    if (index > 0) {
      onIndexChange(index - 1);
    }
  };
  const goNext = () => {
    if (!atEnd) {
      onIndexChange(index + 1);
    } else if (hasNextPage && !isFetchingNextPage) {
      onRequestMore();
    }
  };
  useHotkeys([
    ["ArrowLeft", goPrev],
    ["ArrowRight", goNext],
  ]);

  if (image === undefined) {
    return null;
  }

  const megabytes = new Intl.NumberFormat(i18n.language, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(image.size_bytes / 1_000_000);

  return (
    <Modal
      opened
      onClose={onClose}
      centered
      size="min(1200px, 92vw)"
      closeButtonProps={{ "aria-label": t("viewer.close") }}
      classNames={{ title: classes.title }}
      title={
        <span className={classes.filename} title={image.filename}>
          {image.filename}
        </span>
      }
    >
      <div className={classes.stage}>
        <Stage key={image.id} src={fileUrl(projectId, image.id)} filename={image.filename} />
        <ActionIcon
          variant="default"
          size={40}
          className={`${classes.arrow} ${classes.arrowPrev}`}
          aria-label={t("viewer.prev")}
          disabled={index === 0}
          onClick={goPrev}
        >
          ‹
        </ActionIcon>
        <ActionIcon
          variant="default"
          size={40}
          className={`${classes.arrow} ${classes.arrowNext}`}
          aria-label={t("viewer.next")}
          disabled={atEnd && !hasNextPage}
          loading={atEnd && isFetchingNextPage}
          onClick={goNext}
        >
          ›
        </ActionIcon>
      </div>
      <Group gap="xs" mt="sm">
        <Text size="sm" c="dark.1">
          {t("viewer.dimensions", { width: image.width, height: image.height })}
        </Text>
        <Text size="sm" c="dark.1" aria-hidden>
          ·
        </Text>
        <Text size="sm" c="dark.1">
          {megabytes}
        </Text>
        <Text size="sm" c="dark.1" aria-hidden>
          ·
        </Text>
        <Text size="sm" c="dark.1">
          {t("viewer.position", { index: index + 1, total })}
        </Text>
      </Group>
    </Modal>
  );
}
