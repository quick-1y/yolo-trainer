import { useInfiniteQuery } from "@tanstack/react-query";

import { apiRequest } from "./client";

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

export const PAGE_SIZE = 100;

export const imageKeys = {
  project: (projectId: number) => ["images", projectId] as const,
  list: (projectId: number, sort: string, q: string) => ["images", projectId, sort, q] as const,
};

export function listImages(
  projectId: number,
  { cursor, limit = PAGE_SIZE }: { cursor?: string | null; limit?: number } = {},
): Promise<ImagePage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set("cursor", cursor);
  }
  return apiRequest<ImagePage>(`/projects/${projectId}/images?${params.toString()}`);
}

export function useImagesInfinite(projectId: number) {
  return useInfiniteQuery({
    queryKey: imageKeys.list(projectId, "newest", ""),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listImages(projectId, { cursor: pageParam, limit: PAGE_SIZE }),
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
