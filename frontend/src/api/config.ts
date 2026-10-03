import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "./client";

export interface AppConfig {
  max_upload_mb: number;
  max_upload_bytes: number;
  accepted_extensions: string[];
}

/** Server-provided upload limits; constant for the lifetime of the page. */
export function useAppConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => apiRequest<AppConfig>("/config"),
    staleTime: Infinity,
  });
}
