export const SUPPORTED_LANGUAGES = ["en", "ru"] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "yolo-trainer.language";

function isSupportedLanguage(value: string | null): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

/**
 * Read the remembered manual language choice, if any (T-07-02): some
 * browsers/embedding contexts throw on ANY `localStorage` access (not just
 * writes), so reading is guarded the same way `changeAppLanguage` guards
 * writing - a blocked store must fall back to browser detection, never crash
 * app init.
 */
export function getStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
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

/**
 * Manually switch the UI language (D-02): persists the choice so it wins on
 * the next reload, updates react-i18next immediately (no remount required),
 * and syncs `document.documentElement.lang`.
 *
 * Imports `./index` dynamically (not at module top level) to avoid a static
 * circular dependency - `./index` itself imports `resolveInitialLanguage`
 * and `LANGUAGE_STORAGE_KEY` from this module at its own top level.
 */
export async function changeAppLanguage(lng: AppLanguage): Promise<void> {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // Storage disabled (e.g. private browsing / blocked cookies) - the
    // language still changes, the choice just won't be remembered (T-07-02).
  }

  const { default: i18n } = await import("./index");
  await i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
}
