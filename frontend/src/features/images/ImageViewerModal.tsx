import { Group, Modal, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { fileUrl } from "../../api/images";
import type { ImageItem } from "../../api/images";
import classes from "./ImageViewerModal.module.css";

interface ImageViewerModalProps {
  projectId: number;
  items: ImageItem[];
  index: number;
  total: number;
  onClose: () => void;
}

/**
 * Full-size viewer (D-10). It is only mounted while an image is open, so the
 * original is requested for that one image and never for the grid.
 */
export function ImageViewerModal({ projectId, items, index, total, onClose }: ImageViewerModalProps) {
  const { t, i18n } = useTranslation("images");
  const image = items[index];
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
        <img
          key={image.id}
          className={classes.image}
          src={fileUrl(projectId, image.id)}
          alt={image.filename}
        />
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
