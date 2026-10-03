import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import { thumbnailUrl } from "../../api/images";
import type { ImageItem } from "../../api/images";
import classes from "./ImageTile.module.css";

interface ImageTileProps {
  projectId: number;
  image: ImageItem;
}

/**
 * One thumbnail tile. The filename is rendered as plain text with the full
 * name in the native `title` (no per-tile Mantine Tooltip, no HTML injection).
 * A thumbnail that fails to load is replaced by a "No preview" block; the
 * tile and its caption stay.
 */
export const ImageTile = memo(function ImageTile({ projectId, image }: ImageTileProps) {
  const { t } = useTranslation("images");
  const [failed, setFailed] = useState(false);

  return (
    <div className={classes.tile}>
      {failed ? (
        <div className={classes.noPreview}>{t("tile.noPreview")}</div>
      ) : (
        <img
          className={classes.thumb}
          src={thumbnailUrl(projectId, image.id)}
          width={176}
          height={176}
          decoding="async"
          alt=""
          onError={() => setFailed(true)}
        />
      )}
      <div className={classes.caption} title={image.filename}>
        {image.filename}
      </div>
      <div className={classes.badgeSlot} data-testid="status-badge-slot" />
    </div>
  );
});
