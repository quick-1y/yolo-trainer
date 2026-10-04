import { screen } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

import type { ImageItem } from "../../api/images";
import { makeImageItem } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { ImageGrid, handleEndReached } from "./ImageGrid";

const MOCK_VIEWPORT = { viewportWidth: 1200, viewportHeight: 800, itemWidth: 184, itemHeight: 208 };

function makeItems(count: number): ImageItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeImageItem({ id: i + 1, filename: `img-${i + 1}.jpg` }),
  );
}

interface GridOverrides {
  items?: ImageItem[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  fetchNextPage?: () => void;
}

function renderGrid({
  items = makeItems(3),
  hasNextPage = false,
  isFetchingNextPage = false,
  isFetchNextPageError = false,
  fetchNextPage = () => undefined,
}: GridOverrides = {}) {
  return renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <div style={{ height: 800 }}>
        <ImageGrid
          projectId={7}
          items={items}
          onOpen={() => undefined}
          selected={new Set()}
          onToggleSelect={() => undefined}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetchNextPageError={isFetchNextPageError}
          fetchNextPage={fetchNextPage}
        />
      </div>
    </VirtuosoGridMockContext.Provider>,
  );
}

describe("ImageGrid virtualization", () => {
  it("mounts a bounded number of tiles for 5000 images", () => {
    const { container } = renderGrid({ items: makeItems(5000) });

    const mounted = container.querySelectorAll("img").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(300);
  });
});

describe("handleEndReached", () => {
  it("fetches the next page when one exists and nothing is in flight", () => {
    const fetchNextPage = vi.fn();

    handleEndReached({
      hasNextPage: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage,
    });

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not fetch while a page is already loading", () => {
    const fetchNextPage = vi.fn();

    handleEndReached({
      hasNextPage: true,
      isFetchingNextPage: true,
      isFetchNextPageError: false,
      fetchNextPage,
    });

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not fetch when there is no next page", () => {
    const fetchNextPage = vi.fn();

    handleEndReached({
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage,
    });

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not retry on its own after a failed page (the footer offers a retry button)", () => {
    const fetchNextPage = vi.fn();

    handleEndReached({
      hasNextPage: true,
      isFetchingNextPage: false,
      isFetchNextPageError: true,
      fetchNextPage,
    });

    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});

describe("ImageGrid footer", () => {
  it("shows the loading-more footer while the next page loads", () => {
    renderGrid({ hasNextPage: true, isFetchingNextPage: true });

    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("shows the next-page error with a retry that calls fetchNextPage", async () => {
    const fetchNextPage = vi.fn();
    const { user } = renderGrid({
      hasNextPage: true,
      isFetchNextPageError: true,
      fetchNextPage,
    });

    expect(screen.getByText("Could not load more images.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("renders no footer text when everything is loaded", () => {
    renderGrid();

    expect(screen.queryByText("Loading more…")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not load more images.")).not.toBeInTheDocument();
  });
});
