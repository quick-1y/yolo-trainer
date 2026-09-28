import type { Resource, ResourceLanguage } from "i18next";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { LANGUAGE_STORAGE_KEY, resolveInitialLanguage } from "./language";

// Eagerly load every namespace JSON file under locales/{lng}/{ns}.json into
// react-i18next's resources shape: { [lng]: { [ns]: {...} } }.
const modules = import.meta.glob("./locales/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ResourceLanguage[string]>;

const resources: Resource = {};
for (const [path, content] of Object.entries(modules)) {
  const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lng, ns] = match;
  resources[lng] ??= {};
  resources[lng][ns] = content;
}

const initialLanguage = resolveInitialLanguage(
  localStorage.getItem(LANGUAGE_STORAGE_KEY),
  navigator.languages,
);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  supportedLngs: ["en", "ru"],
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
});

// Keep `document.documentElement.lang` in sync with the active UI language
// at all times (truth: it always equals the active language), regardless of
// whether the change came from `changeAppLanguage` or any other path.
document.documentElement.lang = initialLanguage;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
