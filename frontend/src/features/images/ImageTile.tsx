import { memo } from "react";

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
 */
export const ImageTile = memo(function ImageTile({ projectId, image }: ImageTileProps) {
  return (
    <div className={classes.tile}>
      <img
        className={classes.thumb}
        src={thumbnailUrl(projectId, image.id)}
        width={176}
        height={176}
        decoding="async"
        alt=""
      />
      <div className={classes.caption} title={image.filename}>
        {image.filename}
      </div>
      <div className={classes.badgeSlot} data-testid="status-badge-slot" />
    </div>
  );
});
