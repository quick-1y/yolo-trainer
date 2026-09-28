export const SUPPORTED_LANGUAGES = ["en", "ru"] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "yolo-trainer.language";

function isSupportedLanguage(value: string | null): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

/**
 * Resolve the initial UI language (D-02): the user's remembered manual
 * choice wins; otherwise the browser language decides (`ru*` -> Russian,
 * everything else -> English).
 */
export function resolveInitialLanguage(
  stored: string | null,
  browserLanguages: readonly string[],
): AppLanguage {
  if (isSupportedLanguage(stored)) {
    return stored;
  }
  const primary = browserLanguages[0]?.toLowerCase() ?? "";
  if (primary.startsWith("ru")) {
    return "ru";
  }
  return "en";
}
