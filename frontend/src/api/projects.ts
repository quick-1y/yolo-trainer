import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "./client";

export type TaskType = "detect" | "segment";

export interface Project {
  id: number;
  name: string;
  task_type: TaskType;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreateInput {
  name: string;
  task_type: TaskType;
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
