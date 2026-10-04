import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeImageItem } from "../test/fixtures";
import { ApiError } from "./client";
import {
  DELETE_BATCH_SIZE,
  displayStatus,
  imageKeys,
  patchImageInListCache,
  useDeleteImages,
  useImagesInfinite,
  type ImageItem,
  type ImagePage,
} from "./images";

const PROJECT_ID = 7;
const DELETE_PATH = `/api/projects/${PROJECT_ID}/images/delete`;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function makeItem(id: number): ImageItem {
  return makeImageItem({ id });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface DeleteStub {
  bodies: number[][];
  maxInFlight: () => number;
}

/**
 * Stubs only the delete route. `answer(callIndex, ids)` decides the response of
 * each call (index from 0). Tracks the number of requests in flight at once.
 */
function stubDeleteRoute(answer: (callIndex: number, ids: number[]) => Response): DeleteStub {
  const bodies: number[][] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname !== DELETE_PATH || method !== "POST") {
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    }
    const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
    const callIndex = bodies.length;
    bodies.push(ids);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    inFlight -= 1;
    return answer(callIndex, ids);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { bodies, maxInFlight: () => maxInFlight };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useDeleteImages(PROJECT_ID), { wrapper });
  return { queryClient, result };
}

/** Seed one cached list spread over two pages: ids 1..60 and 61..120, total 120. */
function seedList(queryClient: QueryClient) {
  const key = imageKeys.list(PROJECT_ID, "newest", "");
  const data: InfiniteData<ImagePage, string | null> = {
    pages: [
      { items: range(1, 60).map(makeItem), next_cursor: "c1", total: 120 },
      { items: range(61, 120).map(makeItem), next_cursor: null, total: 120 },
    ],
    pageParams: [null, "c1"],
  };
  queryClient.setQueryData(key, data);
  return key;
}

function cachedIds(queryClient: QueryClient, key: readonly unknown[]): number[] {
  const data = queryClient.getQueryData<InfiniteData<ImagePage, string | null>>(key);
  return (data?.pages ?? []).flatMap((page) => page.items.map((item) => item.id));
}

describe("useDeleteImages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits 2500 ids into ordered chunks of 1000, one request at a time, and sums deleted", async () => {
    const stub = stubDeleteRoute((callIndex) => jsonResponse({ deleted: (callIndex + 1) * 10 }));
    const { result } = setup();
    const ids = range(1, 2500);

    let outcome: { deleted: number } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync(ids);
    });

    expect(DELETE_BATCH_SIZE).toBe(1000);
    expect(stub.bodies).toHaveLength(3);
    expect(stub.bodies[0]).toEqual(range(1, 1000));
    expect(stub.bodies[1]).toEqual(range(1001, 2000));
    expect(stub.bodies[2]).toEqual(range(2001, 2500));
    expect(stub.maxInFlight()).toBe(1);
    expect(outcome).toEqual({ deleted: 60 });
  });

  it("sends exactly 1000 ids as one request", async () => {
    const stub = stubDeleteRoute(() => jsonResponse({ deleted: 1000 }));
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync(range(1, 1000));
    });

    expect(stub.bodies).toHaveLength(1);
    expect(stub.bodies[0]).toEqual(range(1, 1000));
  });

  it("sends 1001 ids as two requests: 1000, then 1", async () => {
    const stub = stubDeleteRoute((_callIndex, ids) => jsonResponse({ deleted: ids.length }));
    const { result } = setup();

    let outcome: { deleted: number } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync(range(1, 1001));
    });

    expect(stub.bodies.map((body) => body.length)).toEqual([1000, 1]);
    expect(stub.bodies[1]).toEqual([1001]);
    expect(outcome).toEqual({ deleted: 1001 });
  });

  it("prunes every deleted id from the cached list and lowers the totals on success", async () => {
    stubDeleteRoute((_callIndex, ids) => jsonResponse({ deleted: ids.length }));
    const { queryClient, result } = setup();
    const key = seedList(queryClient);
    const toDelete = [...range(1, 10), ...range(61, 70)];

    await act(async () => {
      await result.current.mutateAsync(toDelete);
    });

    const remaining = cachedIds(queryClient, key);
    expect(remaining).toHaveLength(100);
    expect(remaining.filter((id) => toDelete.includes(id))).toEqual([]);
    expect(remaining).toEqual([...range(11, 60), ...range(71, 120)]);
    const data = queryClient.getQueryData<InfiniteData<ImagePage, string | null>>(key);
    expect(data?.pages.map((page) => page.total)).toEqual([100, 100]);
  });

  it("when chunk 2 fails: rejects with the API error, sends no chunk 3 and prunes only chunk 1", async () => {
    const stub = stubDeleteRoute((callIndex, ids) =>
      callIndex === 1
        ? jsonResponse({ detail: "Database is unavailable" }, 500)
        : jsonResponse({ deleted: ids.length }),
    );
    const { queryClient, result } = setup();
    // One cached page holding the ids of all three chunks.
    const key = imageKeys.list(PROJECT_ID, "newest", "");
    queryClient.setQueryData(key, {
      pages: [{ items: range(1, 2500).map(makeItem), next_cursor: null, total: 2500 }],
      pageParams: [null],
    } satisfies InfiniteData<ImagePage, string | null>);

    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync(range(1, 2500)).catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).message).toBe("Database is unavailable");
    expect(stub.bodies).toHaveLength(2);
    const remaining = cachedIds(queryClient, key);
    expect(remaining).toEqual(range(1001, 2500));
    const data = queryClient.getQueryData<InfiniteData<ImagePage, string | null>>(key);
    expect(data?.pages[0].total).toBe(1500);
  });

  it("when the first chunk fails nothing is pruned", async () => {
    stubDeleteRoute(() => jsonResponse({ detail: "Database is unavailable" }, 500));
    const { queryClient, result } = setup();
    const key = seedList(queryClient);

    await act(async () => {
      await result.current.mutateAsync(range(1, 10)).catch(() => undefined);
    });

    expect(cachedIds(queryClient, key)).toEqual(range(1, 120));
  });
});

describe("displayStatus", () => {
  const state = { box_count: 0, is_background: false, is_reviewed: false, status: "unannotated" } as const;

  it("is unannotated when there is no box and no flag", () => {
    expect(displayStatus(state)).toBe("unannotated");
  });

  it("is annotated for an image with boxes that is not reviewed", () => {
    expect(displayStatus({ ...state, box_count: 2, status: "annotated" })).toBe("annotated");
  });

  it("is background when only the background flag is set", () => {
    expect(displayStatus({ ...state, status: "annotated", is_background: true })).toBe("background");
  });

  it("lets reviewed beat background and annotated", () => {
    expect(displayStatus({ ...state, status: "reviewed", is_background: true, is_reviewed: true })).toBe(
      "reviewed",
    );
    expect(displayStatus({ ...state, box_count: 1, status: "reviewed", is_reviewed: true })).toBe(
      "reviewed",
    );
  });
});

describe("patchImageInListCache", () => {
  const data: InfiniteData<ImagePage, string | null> = {
    pages: [
      { items: [makeItem(1), makeItem(5)], next_cursor: "c1", total: 4 },
      { items: [makeItem(7), makeItem(9)], next_cursor: null, total: 4 },
    ],
    pageParams: [null, "c1"],
  };
  const patch = { box_count: 3, is_background: false, is_reviewed: true, status: "reviewed" } as const;

  it("patches only the matching item and keeps the rest by reference", () => {
    const next = patchImageInListCache(data, 5, patch);

    expect(next).not.toBe(data);
    expect(next?.pages[0].items[1]).toMatchObject({ id: 5, ...patch });
    expect(next?.pages[0].items[0]).toBe(data.pages[0].items[0]);
    expect(next?.pages[1]).toBe(data.pages[1]);
    expect(next?.pages[0].total).toBe(4);
    expect(next?.pageParams).toEqual([null, "c1"]);
  });

  it("returns the same reference when the image is not loaded", () => {
    expect(patchImageInListCache(data, 42, patch)).toBe(data);
  });

  it("leaves a missing cache entry missing", () => {
    expect(patchImageInListCache(undefined, 5, patch)).toBeUndefined();
  });
});

describe("useImagesInfinite", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a loaded list fresh for five minutes so Back from the editor does not refetch it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ items: [makeItem(1)], next_cursor: null, total: 1 })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useImagesInfinite(PROJECT_ID, "newest", ""), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const query = queryClient.getQueryCache().find({ queryKey: imageKeys.list(PROJECT_ID, "newest", "") });
    expect(query?.observers[0]?.options.staleTime).toBe(300000);
    expect(query?.isStale()).toBe(false);
  });
});
