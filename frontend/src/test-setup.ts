import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import i18n from "./i18n";

// `test.globals` is off (tests import from "vitest" explicitly), so
// Testing Library's own auto-cleanup (which only registers when it finds a
// global `afterEach`) never fires - register it explicitly instead, or a
// modal from one test leaks into the next test's DOM.
afterEach(cleanup);

// findBy*/waitFor default to 1 s, too tight for Mantine transitions under parallel load.
configure({ asyncUtilTimeout: 4000 });

// Mantine reads `window.matchMedia` (color-scheme detection) and
// `ResizeObserver` (several components) - jsdom implements neither.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

if (!("ResizeObserver" in window)) {
  class ResizeObserverPolyfill {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  // @ts-expect-error - jsdom has no ResizeObserver; a minimal stub is enough for tests.
  window.ResizeObserver = ResizeObserverPolyfill;
}

// Mantine's autosizing Textarea listens on `document.fonts` (FontFaceSet),
// which jsdom does not implement.
if (!document.fonts) {
  // @ts-expect-error - minimal stub, only addEventListener/removeEventListener are used.
  document.fonts = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
