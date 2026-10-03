import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest } from "./client";

export type TaskType = "detect" | "segment";

export interface Project {
  id: number;
  name: string;
  task_type: TaskType;
  description: string | null;
  created_at: string;
  updated_at: string;
  image_count: number;
  class_count: number;
}

export interface ProjectCreateInput {
  name: string;
  task_type: TaskType;
  description?: string | null;
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
}

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: number) => ["projects", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiRequest<Project[]>("/projects"),
  });
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: id !== null ? projectKeys.detail(id) : ["projects", "detail", "disabled"],
    queryFn: () => apiRequest<Project>(`/projects/${id}`),
    enabled: id !== null,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      apiRequest<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectUpdateInput) =>
      apiRequest<Project>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}

export function useDeleteProject(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<void>(`/projects/${id}`, { method: "DELETE" });
      } catch (error) {
        // Deleting an already-deleted project is idempotent - a 404 here
        // means the caller's desired end state (the project is gone) is
        // already true, so treat it as success rather than an error.
        if (error instanceof ApiError && error.status === 404) {
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}
