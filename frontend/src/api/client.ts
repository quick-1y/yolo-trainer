export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ErrorBody {
  detail?: string;
}

/**
 * Minimal fetch wrapper for the same-origin `/api` backend (D-05: API errors
 * are shown to the user verbatim, as plain English text).
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as ErrorBody;
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // Response had no JSON body - fall back to statusText above.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}
