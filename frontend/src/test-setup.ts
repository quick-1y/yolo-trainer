import "@testing-library/jest-dom/vitest";

import { beforeEach } from "vitest";

import i18n from "./i18n";

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

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
