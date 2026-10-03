export interface UploadLimits {
  maxUploadBytes: number;
  acceptedExtensions: readonly string[];
}

export type RejectCode = "unsupported" | "tooLarge";

export interface ClientRejection {
  name: string;
  code: RejectCode;
}

/** Lower-cased text after the last dot, or "" when the name has none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Client-side pre-filter against the server's limits (GET /api/config).
 * Pure and untranslated: the caller maps codes to localized reasons. The
 * server still decodes everything it receives (D-01), this only avoids
 * sending files that are certain to be rejected.
 */
export function classifyFiles(
  files: File[],
  limits: UploadLimits,
): { accepted: File[]; rejected: ClientRejection[] } {
  const accepted: File[] = [];
  const rejected: ClientRejection[] = [];
  for (const file of files) {
    if (!limits.acceptedExtensions.includes(extensionOf(file.name))) {
      rejected.push({ name: file.name, code: "unsupported" });
    } else if (file.size > limits.maxUploadBytes) {
      rejected.push({ name: file.name, code: "tooLarge" });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}
