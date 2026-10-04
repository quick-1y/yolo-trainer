import { Checkbox } from "@mantine/core";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import { thumbnailUrl } from "../../api/images";
import type { ImageItem } from "../../api/images";
import classes from "./ImageTile.module.css";

interface ImageTileProps {
  projectId: number;
  image: ImageItem;
  index: number;
  onOpen: (index: number) => void;
  selected: boolean;
  /** True while any tile is selected: every checkbox stays visible. */
  selecting: boolean;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
}

/**
 * One thumbnail tile. The filename is rendered as plain text with the full
 * name in the native `title` (no per-tile Mantine Tooltip, no HTML injection).
 * A thumbnail that fails to load is replaced by a "No preview" block; the
 * tile and its caption stay, and the tile stays clickable. The whole tile is a
 * button: click or Enter opens the annotation editor on this image. The selection
 * checkbox is a separate tab stop whose clicks never reach the tile (D-11).
 */
export const ImageTile = memo(function ImageTile({
  projectId,
  image,
  index,
  onOpen,
  selected,
  selecting,
  onToggleSelect,
}: ImageTileProps) {
  const { t } = useTranslation("images");
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={classes.tile}
      data-selected={selected || undefined}
      data-selecting={selecting || undefined}
      role="button"
      tabIndex={0}
      aria-label={image.filename}
      onClick={() => onOpen(index)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen(index);
        }
      }}
    >
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
      <div
        className={classes.select}
        onClick={(event) => {
          // The whole 32 x 32 hit area toggles; nothing here ever opens the editor.
          event.stopPropagation();
          onToggleSelect(index, event.shiftKey);
        }}
      >
        <Checkbox
          size="sm"
          checked={selected}
          // Toggling happens in the click handler of the hit area (mouse and Space).
          onChange={() => undefined}
          aria-label={t("tile.select", { name: image.filename })}
        />
      </div>
      <div className={classes.badgeSlot} data-testid="status-badge-slot" />
    </div>
  );
});
