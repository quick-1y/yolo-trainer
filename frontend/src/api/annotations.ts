import { type QueryClient, useQuery } from "@tanstack/react-query";

import { apiRequest } from "./client";
import { type ImageDetail, type ImageStatus, imageKeys } from "./images";

/** One box: normalized top-left x/y and size w/h in [0, 1] of the oriented image. */
export interface Box {
  id: string;
  class_id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnnotationSet {
  version: number;
  is_background: boolean;
  is_reviewed: boolean;
  status: ImageStatus;
  boxes: Box[];
}

export interface AnnotationSaveInput {
  base_version: number;
  is_background: boolean;
  is_reviewed: boolean;
  boxes: Box[];
}

export interface SaveResult {
  version: number;
  box_count: number;
  status: ImageStatus;
  is_background: boolean;
  is_reviewed: boolean;
}

export const annotationKeys = {
  set: (projectId: number, imageId: number) => ["annotations", projectId, imageId] as const,
};

export function getAnnotations(projectId: number, imageId: number): Promise<AnnotationSet> {
  return apiRequest<AnnotationSet>(`/projects/${projectId}/images/${imageId}/annotations`);
}

export function useAnnotations(projectId: number | null, imageId: number | null) {
  return useQuery({
    queryKey: annotationKeys.set(projectId ?? 0, imageId ?? 0),
    queryFn: () => getAnnotations(projectId as number, imageId as number),
    enabled: projectId !== null && imageId !== null,
    // The editor owns the live copy; a focus refetch must never replace it.
    refetchOnWindowFocus: false,
  });
}

/** Whole-set replace guarded by `base_version` (409 when the version is stale). */
export function saveAnnotations(
  projectId: number,
  imageId: number,
  input: AnnotationSaveInput,
): Promise<SaveResult> {
  return apiRequest<SaveResult>(`/projects/${projectId}/images/${imageId}/annotations`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/**
 * After a successful save: write the saved set into the annotations cache and
 * patch the cached image detail, so a later visit never shows stale state.
 */
export function syncAfterSave(
  queryClient: QueryClient,
  projectId: number,
  imageId: number,
  input: AnnotationSaveInput,
  result: SaveResult,
): void {
  queryClient.setQueryData<AnnotationSet>(annotationKeys.set(projectId, imageId), {
    version: result.version,
    is_background: result.is_background,
    is_reviewed: result.is_reviewed,
    status: result.status,
    boxes: input.boxes,
  });
  queryClient.setQueryData<ImageDetail>(imageKeys.detail(projectId, imageId), (current) =>
    current === undefined
      ? current
      : {
          ...current,
          box_count: result.box_count,
          status: result.status,
          is_background: result.is_background,
          is_reviewed: result.is_reviewed,
        },
  );
}

/** The saver's `send` function for one image. */
export function createAnnotationSender(
  queryClient: QueryClient,
  projectId: number,
  imageId: number,
): (input: AnnotationSaveInput) => Promise<SaveResult> {
  return (input) =>
    saveAnnotations(projectId, imageId, input).then((result) => {
      syncAfterSave(queryClient, projectId, imageId, input, result);
      return result;
    });
}
