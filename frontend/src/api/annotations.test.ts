import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeImageItem } from "../test/fixtures";
import { type AnnotationSaveInput, type AnnotationSet, type SaveResult, annotationKeys, syncAfterSave } from "./annotations";
import { classKeys } from "./classes";
import { type ImageDetail, type ImagePage, imageKeys, useImagesInfinite } from "./images";

const PROJECT_ID = 1;
const IMAGE_ID = 5;

const INPUT: AnnotationSaveInput = {
  base_version: 1,
  is_background: false,
  is_reviewed: false,
  boxes: [
    { id: "a", class_id: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { id: "b", class_id: 1, x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
  ],
};

const RESULT: SaveResult = {
  version: 2,
  box_count: 2,
  status: "annotated",
  is_background: false,
  is_reviewed: false,
};

function list(ids: number[]): InfiniteData<ImagePage, string | null> {
  return {
    pages: [{ items: ids.map((id) => makeImageItem({ id })), next_cursor: null, total: ids.length }],
    pageParams: [null],
  };
}

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(imageKeys.list(PROJECT_ID, "newest", ""), list([4, 5, 6]));
  queryClient.setQueryData(imageKeys.list(PROJECT_ID, "name", "img"), list([5]));
  queryClient.setQueryData(imageKeys.list(2, "newest", ""), list([5]));
  queryClient.setQueryData<ImageDetail>(
    imageKeys.detail(PROJECT_ID, IMAGE_ID),
    makeImageItem({ id: IMAGE_ID }),
  );
  queryClient.setQueryData<AnnotationSet>(annotationKeys.set(PROJECT_ID, IMAGE_ID), {
    version: 1,
    is_background: false,
    is_reviewed: false,
    status: "unannotated",
    boxes: [],
  });
  queryClient.setQueryData(imageKeys.summary(PROJECT_ID), {
    total: 3,
    unannotated: 3,
    annotated: 0,
    reviewed: 0,
    background: 0,
  });
  queryClient.setQueryData(classKeys.list(PROJECT_ID), []);
  return queryClient;
}

function item(queryClient: QueryClient, key: readonly unknown[], id: number) {
  return queryClient
    .getQueryData<InfiniteData<ImagePage, string | null>>(key)
    ?.pages.flatMap((page) => page.items)
    .find((candidate) => candidate.id === id);
}

describe("syncAfterSave", () => {
  it("patches the saved image in every cached list of the project", () => {
    const queryClient = setup();

    syncAfterSave(queryClient, PROJECT_ID, IMAGE_ID, INPUT, RESULT);

    for (const key of [
      imageKeys.list(PROJECT_ID, "newest", ""),
      imageKeys.list(PROJECT_ID, "name", "img"),
    ]) {
      expect(item(queryClient, key, IMAGE_ID)).toMatchObject({
        box_count: 2,
        status: "annotated",
        is_background: false,
        is_reviewed: false,
      });
    }
    expect(item(queryClient, imageKeys.list(PROJECT_ID, "newest", ""), 4)?.box_count).toBe(0);
  });

  it("leaves the lists of another project untouched", () => {
    const queryClient = setup();

    syncAfterSave(queryClient, PROJECT_ID, IMAGE_ID, INPUT, RESULT);

    expect(item(queryClient, imageKeys.list(2, "newest", ""), IMAGE_ID)?.box_count).toBe(0);
  });

  it("updates the detail and the annotation set to the saved version", () => {
    const queryClient = setup();

    syncAfterSave(queryClient, PROJECT_ID, IMAGE_ID, INPUT, RESULT);

    expect(queryClient.getQueryData<ImageDetail>(imageKeys.detail(PROJECT_ID, IMAGE_ID))).toMatchObject({
      box_count: 2,
      status: "annotated",
    });
    expect(
      queryClient.getQueryData<AnnotationSet>(annotationKeys.set(PROJECT_ID, IMAGE_ID)),
    ).toMatchObject({ version: 2, status: "annotated", boxes: INPUT.boxes });
  });

  it("refreshes the status summary and marks the class list stale without refetching it", () => {
    const queryClient = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    syncAfterSave(queryClient, PROJECT_ID, IMAGE_ID, INPUT, RESULT);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: imageKeys.summary(PROJECT_ID) });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: classKeys.list(PROJECT_ID),
      refetchType: "none",
    });
    expect(queryClient.getQueryState(imageKeys.summary(PROJECT_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(classKeys.list(PROJECT_ID))?.isInvalidated).toBe(true);
  });

  describe("when the grid comes back", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("shows the patched item and does not request the loaded pages again", async () => {
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({ items: [makeImageItem({ id: IMAGE_ID })], next_cursor: null, total: 1 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const grid = renderHook(() => useImagesInfinite(PROJECT_ID, "newest", ""), { wrapper });
      await waitFor(() => {
        expect(grid.result.current.isSuccess).toBe(true);
      });
      grid.unmount();

      syncAfterSave(queryClient, PROJECT_ID, IMAGE_ID, INPUT, RESULT);
      const back = renderHook(() => useImagesInfinite(PROJECT_ID, "newest", ""), { wrapper });

      expect(back.result.current.data?.pages[0].items[0]).toMatchObject({
        box_count: 2,
        status: "annotated",
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
