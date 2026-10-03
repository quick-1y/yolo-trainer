import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "./client";
import { projectKeys } from "./projects";

export interface ImageItem {
  id: number;
  filename: string;
  width: number;
  height: number;
  size_bytes: number;
  created_at: string;
}

export interface ImagePage {
  items: ImageItem[];
  next_cursor: string | null;
  total: number;
}

export type UploadStatus = "added" | "duplicate" | "rejected";

export interface UploadResult {
  filename: string;
  status: UploadStatus;
  reason: string | null;
  image: ImageItem | null;
}

export interface UploadResponse {
  results: UploadResult[];
}

export interface DeleteImagesResult {
  deleted: number;
}

export type ImageSort = "newest" | "name";

export const PAGE_SIZE = 100;

export const imageKeys = {
  project: (projectId: number) => ["images", projectId] as const,
  list: (projectId: number, sort: string, q: string) => ["images", projectId, sort, q] as const,
};

export function listImages(
  projectId: number,
  {
    sort = "newest",
    q = "",
    cursor,
    limit = PAGE_SIZE,
  }: {
    sort?: ImageSort;
    q?: string;
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<ImagePage> {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (q) {
    params.set("q", q);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  return apiRequest<ImagePage>(`/projects/${projectId}/images?${params.toString()}`);
}

export function useImagesInfinite(projectId: number, sort: ImageSort = "newest", q = "") {
  return useInfiniteQuery({
    queryKey: imageKeys.list(projectId, sort, q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listImages(projectId, { sort, q, cursor: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) => last.next_cursor,
  });
}

/**
 * Send one batch of files as a single multipart request. The multipart
 * Content-Type (with its boundary) is left to the browser - apiRequest skips
 * the JSON header for FormData bodies.
 */
export function uploadImageBatch(
  projectId: number,
  files: File[],
  signal?: AbortSignal,
): Promise<UploadResponse> {
  const body = new FormData();
  for (const file of files) {
    body.append("files", file, file.name);
  }
  return apiRequest<UploadResponse>(`/projects/${projectId}/images`, {
    method: "POST",
    body,
    signal,
  });
}

export function thumbnailUrl(projectId: number, imageId: number): string {
  return `/api/projects/${projectId}/images/${imageId}/thumbnail`;
}

/** The stored original; only the open viewer image ever requests it. */
export function fileUrl(projectId: number, imageId: number): string {
  return `/api/projects/${projectId}/images/${imageId}/file`;
}

/**
 * Remove the deleted ids from every cached page of every list of this project
 * and lower each page's `total` by the number removed from that list, so the
 * grid updates in place without refetching every loaded page.
 */
export function pruneDeletedImages(
  data: InfiniteData<ImagePage, string | null> | undefined,
  ids: ReadonlySet<number>,
): InfiniteData<ImagePage, string | null> | undefined {
  if (data === undefined) {
    return data;
  }
  const removed = data.pages.reduce(
    (count, page) => count + page.items.filter((item) => ids.has(item.id)).length,
    0,
  );
  if (removed === 0) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => !ids.has(item.id)),
      total: Math.max(0, page.total - removed),
    })),
  };
}

export function useDeleteImages(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      apiRequest<DeleteImagesResult>(`/projects/${projectId}/images/delete`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (_result, ids) => {
      const deleted = new Set(ids);
      queryClient.setQueriesData<InfiniteData<ImagePage, string | null>>(
        { queryKey: imageKeys.project(projectId) },
        (data) => pruneDeletedImages(data, deleted),
      );
      // Lists that were not loaded far enough (or are not on screen) may still
      // hold stale totals: mark them stale without refetching what is visible.
      void queryClient.invalidateQueries({
        queryKey: imageKeys.project(projectId),
        refetchType: "none",
      });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
