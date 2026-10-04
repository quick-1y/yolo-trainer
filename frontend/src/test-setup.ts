import "vitest-canvas-mock";
import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import i18n from "./i18n";

// `test.globals` is off (tests import from "vitest" explicitly), so
// Testing Library's own auto-cleanup (which only registers when it finds a
// global `afterEach`) never fires - register it explicitly instead, or a
// modal from one test leaks into the next test's DOM.
afterEach(cleanup);

// findBy*/waitFor default to 1 s; 4 s (set earlier) still expired under full-suite load
// (50 jsdom workers, ClassRow/ImagesUrlState/ImagesSelection flakes failing at ~4.6 s).
// 8 s stays well under testTimeout (15 s, vite.config.ts) and weakens no assertion: it only
// bounds how long a passing wait may take, a genuinely failing wait still fails.
configure({ asyncUtilTimeout: 8000 });

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

// Mantine's Select/Combobox scrolls the selected option into view; jsdom has no layout
// and no `scrollIntoView`.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
