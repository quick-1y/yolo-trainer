import { beforeEach, describe, expect, it, vi } from "vitest";

import { changeAppLanguage, LANGUAGE_STORAGE_KEY, resolveInitialLanguage } from "./language";
import i18n from "./index";

describe("resolveInitialLanguage", () => {
  it("falls back to the browser language when nothing is stored", () => {
    expect(resolveInitialLanguage(null, ["ru-RU", "en"])).toBe("ru");
    expect(resolveInitialLanguage(null, ["RU"])).toBe("ru");
    expect(resolveInitialLanguage(null, ["en-US"])).toBe("en");
    expect(resolveInitialLanguage(null, ["uk-UA"])).toBe("en");
    expect(resolveInitialLanguage(null, [])).toBe("en");
  });

  it("prefers a stored manual choice over the browser language", () => {
    expect(resolveInitialLanguage("ru", ["en-US"])).toBe("ru");
  });

  it("ignores an unsupported stored value and falls back to the browser rule", () => {
    expect(resolveInitialLanguage("de", ["ru"])).toBe("ru");
  });
});

describe("changeAppLanguage", () => {
  beforeEach(() => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  it("persists the manual choice, updates i18n, and syncs document.documentElement.lang", async () => {
    await changeAppLanguage("ru");

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ru");
    expect(i18n.language).toBe("ru");
    expect(document.documentElement.lang).toBe("ru");

    await changeAppLanguage("en");

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("still changes the active language even if localStorage access throws", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    await expect(changeAppLanguage("ru")).resolves.toBeUndefined();
    expect(i18n.language).toBe("ru");
    expect(document.documentElement.lang).toBe("ru");

    setItemSpy.mockRestore();
    await changeAppLanguage("en");
  });
});

describe("initializing i18n without a stored choice", () => {
  it("never writes to localStorage during detection", () => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    resolveInitialLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY), navigator.languages);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});
