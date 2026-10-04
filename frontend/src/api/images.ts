import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "./client";
import { projectKeys } from "./projects";

/** One image as the server lists it, annotation state included. */
export interface ImageItem extends ImageAnnotationState {
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

/** Derived server-side: reviewed > annotated (a box or background) > unannotated. */
export type ImageStatus = "unannotated" | "annotated" | "reviewed";

export interface ImageAnnotationState {
  box_count: number;
  is_background: boolean;
  is_reviewed: boolean;
  status: ImageStatus;
}

/** What a tile and the editor badge show: reviewed > background > annotated > unannotated. */
export type DisplayStatus = "unannotated" | "annotated" | "reviewed" | "background";

/**
 * The status of an image for display. The server's `status` folds background into
 * annotated, so the flags decide here; unannotated and background stay apart.
 */
export function displayStatus(state: ImageAnnotationState): DisplayStatus {
  if (state.is_reviewed) {
    return "reviewed";
  }
  if (state.is_background) {
    return "background";
  }
  return state.box_count > 0 ? "annotated" : "unannotated";
}

/** GET /projects/{p}/images/{i}: the same item the list returns. */
export type ImageDetail = ImageItem;

/** GET /projects/{p}/images/{i}/neighbors: where an image sits in the grid order of one sort and search. */
export interface Neighbors {
  /** 1-based index in the filtered grid; null when the image does not match the search. */
  position: number | null;
  total: number;
  prev_id: number | null;
  next_id: number | null;
}

/** GET /projects/{p}/images/next-unannotated: the next image still needing work, or none. */
export interface NextUnannotated {
  image_id: number | null;
}

/** GET /projects/{p}/images/status-counts: the whole project, whatever the search. */
export interface StatusCounts {
  total: number;
  unannotated: number;
  annotated: number;
  reviewed: number;
  background: number;
}

export const PAGE_SIZE = 100;

/** How long a loaded image list counts as fresh. */
export const LIST_STALE_TIME_MS = 5 * 60 * 1000;

export const imageKeys = {
  project: (projectId: number) => ["images", projectId] as const,
  list: (projectId: number, sort: string, q: string) => ["images", projectId, sort, q] as const,
  // A different root from ["images", ...] on purpose: the list-cache helpers
  // (setQueriesData / invalidate on imageKeys.project) never touch a detail entry.
  detail: (projectId: number, imageId: number) => ["image", projectId, imageId] as const,
  neighbors: (projectId: number, imageId: number, sort: string, q: string) =>
    ["image", projectId, imageId, "neighbors", sort, q] as const,
  // Its own root, like `detail`: the list-cache helpers never touch it.
  summary: (projectId: number) => ["imageSummary", projectId] as const,
};

export function getImage(projectId: number, imageId: number): Promise<ImageDetail> {
  return apiRequest<ImageDetail>(`/projects/${projectId}/images/${imageId}`);
}

export function useImage(projectId: number | null, imageId: number | null) {
  return useQuery({
    queryKey: imageKeys.detail(projectId ?? 0, imageId ?? 0),
    queryFn: () => getImage(projectId as number, imageId as number),
    enabled: projectId !== null && imageId !== null,
  });
}

export function getNeighbors(
  projectId: number,
  imageId: number,
  { sort = "newest", q = "" }: { sort?: ImageSort; q?: string } = {},
): Promise<Neighbors> {
  const params = new URLSearchParams({ sort });
  if (q) {
    params.set("q", q);
  }
  return apiRequest<Neighbors>(
    `/projects/${projectId}/images/${imageId}/neighbors?${params.toString()}`,
  );
}

/** The editor's prev/next ids and "N of M", read from the server so a hard reload keeps working. */
export function useNeighbors(
  projectId: number | null,
  imageId: number | null,
  sort: ImageSort = "newest",
  q = "",
) {
  return useQuery({
    queryKey: imageKeys.neighbors(projectId ?? 0, imageId ?? 0, sort, q),
    queryFn: () => getNeighbors(projectId as number, imageId as number, { sort, q }),
    enabled: projectId !== null && imageId !== null,
  });
}

/**
 * The first unannotated image after `after` in the grid order of one sort and search,
 * wrapping to the start; `image_id` is null when no other image needs work.
 */
export function getNextUnannotated(
  projectId: number,
  { sort = "newest", q = "", after }: { sort?: ImageSort; q?: string; after?: number } = {},
): Promise<NextUnannotated> {
  const params = new URLSearchParams({ sort });
  if (q) {
    params.set("q", q);
  }
  if (after !== undefined) {
    params.set("after", String(after));
  }
  return apiRequest<NextUnannotated>(
    `/projects/${projectId}/images/next-unannotated?${params.toString()}`,
  );
}

export function getStatusCounts(projectId: number): Promise<StatusCounts> {
  return apiRequest<StatusCounts>(`/projects/${projectId}/images/status-counts`);
}

/** How far along the project is; the grid's summary reads it. */
export function useStatusCounts(projectId: number | null) {
  return useQuery({
    queryKey: imageKeys.summary(projectId ?? 0),
    queryFn: () => getStatusCounts(projectId as number),
    enabled: projectId !== null,
  });
}

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
    // A refetch of an infinite query re-requests every loaded page one after another, so
    // Back from the editor must not trigger one. Saves patch the cached items in place.
    staleTime: LIST_STALE_TIME_MS,
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

/** The stored original; only the annotation editor requests it. */
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

/**
 * Copy a saved image's annotation state into its cached list item, so the grid shows
 * the new status and box count without refetching. Returns `data` itself when the image
 * is not in the loaded pages, and keeps every untouched page and item by reference.
 */
export function patchImageInListCache(
  data: InfiniteData<ImagePage, string | null> | undefined,
  imageId: number,
  patch: ImageAnnotationState,
): InfiniteData<ImagePage, string | null> | undefined {
  if (data === undefined) {
    return data;
  }
  if (!data.pages.some((page) => page.items.some((item) => item.id === imageId))) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some((item) => item.id === imageId)
        ? {
            ...page,
            items: page.items.map((item) =>
              item.id === imageId
                ? {
                    ...item,
                    box_count: patch.box_count,
                    is_background: patch.is_background,
                    is_reviewed: patch.is_reviewed,
                    status: patch.status,
                  }
                : item,
            ),
          }
        : page,
    ),
  };
}

// Must equal ImageDeleteRequest.ids max_length in backend/src/yolo_trainer_api/schemas.py:
// the backend keeps that bound on request size and the client splits the ids instead.
export const DELETE_BATCH_SIZE = 1000;

export function useDeleteImages(projectId: number) {
  const queryClient = useQueryClient();

  // Drop rows that are already gone server-side from every cached list and
  // refresh the counts. Used for a fully successful delete and, on a failure
  // part-way, for the chunks that did succeed.
  const syncDeleted = (ids: number[]) => {
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
  };

  return useMutation({
    // Sequential on purpose: SQLite has a single writer, and on a failure the
    // deleted ids form a well-defined prefix of the selection.
    mutationFn: async (ids: number[]): Promise<DeleteImagesResult> => {
      let deleted = 0;
      let succeeded = 0;
      try {
        for (let start = 0; start < ids.length; start += DELETE_BATCH_SIZE) {
          const slice = ids.slice(start, start + DELETE_BATCH_SIZE);
          const result = await apiRequest<DeleteImagesResult>(
            `/projects/${projectId}/images/delete`,
            { method: "POST", body: JSON.stringify({ ids: slice }) },
          );
          deleted += result.deleted;
          succeeded += slice.length;
        }
      } catch (error) {
        if (succeeded > 0) {
          syncDeleted(ids.slice(0, succeeded));
        }
        throw error;
      }
      return { deleted };
    },
    onSuccess: (_result, ids) => {
      syncDeleted(ids);
    },
  });
}
