import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "./client";

export interface ProjectClassItem {
  id: number;
  name: string;
  color: string;
  index: number;
  created_at: string;
}

export interface ClassCreateInput {
  name: string;
  color?: string;
}

export const classKeys = {
  list: (projectId: number) => ["classes", projectId] as const,
};

export function useClasses(projectId: number) {
  return useQuery({
    queryKey: classKeys.list(projectId),
    queryFn: () => apiRequest<ProjectClassItem[]>(`/projects/${projectId}/classes`),
  });
}

export function useCreateClass(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClassCreateInput) =>
      apiRequest<ProjectClassItem>(`/projects/${projectId}/classes`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classKeys.list(projectId) });
    },
  });
}
