import { VirtuosoGrid } from "react-virtuoso";

import type { ImageItem } from "../../api/images";
import classes from "./ImageGrid.module.css";
import { ImageTile } from "./ImageTile";

interface ImageGridProps {
  projectId: number;
  items: ImageItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

/**
 * Virtualized thumbnail grid with its own scroller, so the project sidebar
 * and the page toolbar never scroll away. The parent gives it a fixed-height
 * flex region.
 */
export function ImageGrid({
  projectId,
  items,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: ImageGridProps) {
  return (
    <VirtuosoGrid
      style={{ height: "100%" }}
      data={items}
      computeItemKey={(_, image) => image.id}
      endReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      increaseViewportBy={{ top: 400, bottom: 800 }}
      listClassName={classes.list}
      itemClassName={classes.item}
      itemContent={(_, image) => <ImageTile projectId={projectId} image={image} />}
    />
  );
}
