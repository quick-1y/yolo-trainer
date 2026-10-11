import { afterEach, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";

/**
 * jsdom lays nothing out, so Recharts' `ResponsiveContainer` measures 0 x 0 and renders no
 * plot (it replaces `initialDimension` with the measured size). Call this at the top of a test
 * file that renders charts: during each test the containers report a fixed size.
 */
export function useSizedRechartsContainers(width = 300, height = 200): void {
  let spy: MockInstance | null = null;
  beforeEach(() => {
    const measure = Element.prototype.getBoundingClientRect;
    spy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this.classList.contains("recharts-responsive-container")) {
          return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            width,
            height,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return measure.call(this);
      });
  });
  afterEach(() => {
    spy?.mockRestore();
    spy = null;
  });
}
