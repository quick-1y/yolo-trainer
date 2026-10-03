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
    queryFn: () =>
      apiRequest<ProjectClassItem[]>(`/projects/${projectId}/classes`),
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
      void queryClient.invalidateQueries({
        queryKey: classKeys.list(projectId),
      });
    },
  });
}

export interface ClassUpdateInput {
  id: number;
  name?: string;
  color?: string;
}

export function useUpdateClass(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: ClassUpdateInput) =>
      apiRequest<ProjectClassItem>(`/projects/${projectId}/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      }),
    onSuccess: (updated) => {
      // Write the server's answer into the cached list right away so a row
      // never flickers back to its old name/color before the refetch lands.
      queryClient.setQueryData<ProjectClassItem[]>(
        classKeys.list(projectId),
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      void queryClient.invalidateQueries({
        queryKey: classKeys.list(projectId),
      });
    },
  });
}
