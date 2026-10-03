import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { VirtuosoGrid } from "react-virtuoso";

import type { ImageItem } from "../../api/images";
import classes from "./ImageGrid.module.css";
import { ImageTile } from "./ImageTile";

interface PagingState {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
}

interface ImageGridProps extends PagingState {
  projectId: number;
  items: ImageItem[];
  onOpen: (index: number) => void;
}

/**
 * End-reached guard: fetch only when a next page exists, none is in flight and
 * the last attempt did not fail (after a failure the footer's retry button is
 * the only way on, so scrolling cannot hammer a broken endpoint).
 */
export function handleEndReached({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
}: PagingState): void {
  if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
    fetchNextPage();
  }
}

/** 48px row under the tiles: loading indicator or an inline retryable error. */
function GridFooter({ context }: { context?: PagingState }) {
  const { t } = useTranslation(["images", "common"]);
  if (context === undefined) {
    return null;
  }
  if (context.isFetchNextPageError) {
    return (
      <Group justify="center" gap="sm" h={48}>
        <Text size="sm" c="red.4">
          {t("images:error.nextPage")}
        </Text>
        <Button variant="light" color="red" size="compact-sm" onClick={context.fetchNextPage}>
          {t("common:retry")}
        </Button>
      </Group>
    );
  }
  if (context.isFetchingNextPage) {
    return (
      <Group justify="center" h={48}>
        <Text size="sm" c="dark.1">
          {t("images:loadingMore")}
        </Text>
      </Group>
    );
  }
  return null;
}

const GRID_COMPONENTS = { Footer: GridFooter };

/**
 * Virtualized thumbnail grid with its own scroller, so the project sidebar
 * and the page toolbar never scroll away. The parent gives it a fixed-height
 * flex region.
 */
export function ImageGrid({
  projectId,
  items,
  onOpen,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
}: ImageGridProps) {
  const paging: PagingState = {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  };
  return (
    <VirtuosoGrid
      style={{ height: "100%" }}
      data={items}
      context={paging}
      components={GRID_COMPONENTS}
      computeItemKey={(_, image) => image.id}
      endReached={() => handleEndReached(paging)}
      increaseViewportBy={{ top: 400, bottom: 800 }}
      listClassName={classes.list}
      itemClassName={classes.item}
      itemContent={(index, image) => (
        <ImageTile projectId={projectId} image={image} index={index} onOpen={onOpen} />
      )}
    />
  );
}
