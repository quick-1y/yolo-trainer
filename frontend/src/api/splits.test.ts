import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeImageItem } from "../test/fixtures";
import { imageKeys, type ImagePage } from "./images";
import { patchSplitInListCache, SPLIT_BATCH_SIZE, SplitBatchError, useSetSplit } from "./splits";

const PROJECT_ID = 7;
const SPLIT_PATH = `/api/projects/${PROJECT_ID}/images/split`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function listData(...pages: number[][]): InfiniteData<ImagePage, string | null> {
  return {
    pageParams: pages.map(() => null),
    pages: pages.map((ids) => ({
      items: ids.map((id) => makeImageItem({ id })),
      next_cursor: null,
      total: ids.length,
    })),
  };
}

describe("patchSplitInListCache", () => {
  it("sets the split on the listed ids and keeps everything else by reference", () => {
    const data = listData([1, 2], [3, 4]);

    const next = patchSplitInListCache(data, new Set([3]), "valid");

    expect(next?.pages[0]).toBe(data.pages[0]);
    expect(next?.pages[1].items[0]).toMatchObject({ id: 3, split: "valid" });
    expect(next?.pages[1].items[1]).toBe(data.pages[1].items[1]);
  });

  it("returns the same data when no loaded item matches or changes", () => {
    const data = listData([1, 2]);

    expect(patchSplitInListCache(data, new Set([99]), "train")).toBe(data);
    expect(patchSplitInListCache(data, new Set([1]), null)).toBe(data);
    expect(patchSplitInListCache(undefined, new Set([1]), "train")).toBeUndefined();
  });
});

describe("useSetSplit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup(answer: (call: number, ids: number[]) => Response) {
    const bodies: { ids: number[]; split: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname !== SPLIT_PATH || init?.method !== "POST") {
          throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url.pathname}`);
        }
        const body = JSON.parse(String(init.body)) as { ids: number[]; split: string | null };
        bodies.push(body);
        return answer(bodies.length - 1, body.ids);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(imageKeys.list(PROJECT_ID, "newest", ""), listData([1, 2, 3]));
    client.setQueryData(imageKeys.detail(PROJECT_ID, 2), makeImageItem({ id: 2 }));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const hook = renderHook(() => useSetSplit(PROJECT_ID), { wrapper });
    return { bodies, client, hook };
  }

  it("sends one request for a small selection and patches the caches in place", async () => {
    const { bodies, client, hook } = setup((_call, ids) => jsonResponse({ updated: ids.length }));

    await act(async () => {
      await hook.result.current.mutateAsync({ ids: [2, 3], split: "train" });
    });

    expect(bodies).toEqual([{ ids: [2, 3], split: "train" }]);
    const list = client.getQueryData<InfiniteData<ImagePage, string | null>>(
      imageKeys.list(PROJECT_ID, "newest", ""),
    );
    expect(list?.pages[0].items.map((item) => item.split)).toEqual([null, "train", "train"]);
    expect(client.getQueryData(imageKeys.detail(PROJECT_ID, 2))).toMatchObject({ split: "train" });
  });

  it("sends a selection over the batch size in sequential chunks", async () => {
    const ids = Array.from({ length: SPLIT_BATCH_SIZE + 1 }, (_, i) => i + 1);
    const { bodies, hook } = setup((_call, slice) => jsonResponse({ updated: slice.length }));

    let result = { updated: 0 };
    await act(async () => {
      result = await hook.result.current.mutateAsync({ ids, split: null });
    });

    expect(bodies.map((body) => body.ids.length)).toEqual([SPLIT_BATCH_SIZE, 1]);
    expect(bodies[0].split).toBeNull();
    expect(result).toEqual({ updated: SPLIT_BATCH_SIZE + 1 });
  });

  it("reports the updated prefix and the API message when a later chunk fails", async () => {
    const ids = Array.from({ length: SPLIT_BATCH_SIZE + 1 }, (_, i) => i + 1);
    const { client, hook } = setup((call, slice) =>
      call === 0
        ? jsonResponse({ updated: slice.length })
        : jsonResponse({ detail: "Database is busy." }, 500),
    );

    let caught: unknown;
    await act(async () => {
      try {
        await hook.result.current.mutateAsync({ ids, split: "valid" });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(SplitBatchError);
    expect(caught).toMatchObject({ done: SPLIT_BATCH_SIZE, total: SPLIT_BATCH_SIZE + 1 });
    expect((caught as Error).message).toBe("Database is busy.");
    // ids 2 and 3 were in the first chunk: the cached list shows the new split
    await waitFor(() => {
      const list = client.getQueryData<InfiniteData<ImagePage, string | null>>(
        imageKeys.list(PROJECT_ID, "newest", ""),
      );
      expect(list?.pages[0].items.map((item) => item.split)).toEqual(["valid", "valid", "valid"]);
    });
  });
});
