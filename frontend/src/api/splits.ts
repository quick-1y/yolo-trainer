import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "./client";
import { type ImageDetail, type ImagePage, type ImageSplit, imageKeys } from "./images";

// Must equal SplitRequest.ids max_length in backend/src/yolo_trainer_api/schemas.py:
// the backend keeps that bound on request size and the client splits the ids instead.
export const SPLIT_BATCH_SIZE = 1000;

export interface SetSplitVariables {
  ids: number[];
  /** `null` returns the images to "no split". */
  split: ImageSplit | null;
}

export interface SetSplitResult {
  updated: number;
}

/**
 * A chunk of a bulk split update failed. `done` images were already updated (the chunks
 * before it), out of `total` requested; `message` is the API message, shown as received.
 */
export class SplitBatchError extends Error {
  readonly done: number;
  readonly total: number;

  constructor(done: number, total: number, message: string) {
    super(message);
    this.name = "SplitBatchError";
    this.done = done;
    this.total = total;
  }
}

/**
 * Set `split` on the listed images in every cached page of every list of one project, so
 * the grid shows the new pill without refetching. Returns `data` itself when no loaded
 * item changes, and keeps every untouched page and item by reference.
 */
export function patchSplitInListCache(
  data: InfiniteData<ImagePage, string | null> | undefined,
  ids: ReadonlySet<number>,
  split: ImageSplit | null,
): InfiniteData<ImagePage, string | null> | undefined {
  if (data === undefined) {
    return data;
  }
  const changes = (item: ImageDetail) => ids.has(item.id) && item.split !== split;
  if (!data.pages.some((page) => page.items.some(changes))) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some(changes)
        ? { ...page, items: page.items.map((item) => (changes(item) ? { ...item, split } : item)) }
        : page,
    ),
  };
}

/**
 * Assign images to a split (or to none). Sequential chunks of SPLIT_BATCH_SIZE, so one
 * image and a selection over 1000 take the same path. On success, and for the chunks that
 * did succeed before a failure, the cached grid and image details are patched in place and
 * the split counts are refetched.
 */
export function useSetSplit(projectId: number) {
  const queryClient = useQueryClient();

  const syncSplit = (ids: number[], split: ImageSplit | null) => {
    if (ids.length === 0) {
      return;
    }
    const changed = new Set(ids);
    queryClient.setQueriesData<InfiniteData<ImagePage, string | null>>(
      { queryKey: imageKeys.project(projectId) },
      (data) => patchSplitInListCache(data, changed, split),
    );
    for (const id of changed) {
      queryClient.setQueryData<ImageDetail>(
        imageKeys.detail(projectId, id),
        (old) => old && { ...old, split },
      );
    }
    void queryClient.invalidateQueries({ queryKey: imageKeys.summary(projectId) });
  };

  return useMutation<SetSplitResult, Error, SetSplitVariables>({
    // Sequential on purpose: SQLite has a single writer, and on a failure the updated
    // ids form a well-defined prefix of the selection.
    mutationFn: async ({ ids, split }) => {
      let updated = 0;
      let succeeded = 0;
      try {
        for (let start = 0; start < ids.length; start += SPLIT_BATCH_SIZE) {
          const slice = ids.slice(start, start + SPLIT_BATCH_SIZE);
          const result = await apiRequest<SetSplitResult>(`/projects/${projectId}/images/split`, {
            method: "POST",
            body: JSON.stringify({ ids: slice, split }),
          });
          updated += result.updated;
          succeeded += slice.length;
        }
      } catch (error) {
        syncSplit(ids.slice(0, succeeded), split);
        throw new SplitBatchError(
          updated,
          ids.length,
          error instanceof Error ? error.message : String(error),
        );
      }
      return { updated };
    },
    onSuccess: (_result, { ids, split }) => {
      syncSplit(ids, split);
    },
  });
}
