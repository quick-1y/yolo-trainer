import { describe, expect, it } from "vitest";

import {
  FIT_MARGIN,
  MAX_FIT_SCALE,
  MAX_SCALE,
  ZOOM_STEP,
  fitViewport,
  panBy,
  zoomAt,
  zoomLimits,
} from "./viewport";

/** The image point under a screen point. */
function imagePoint(view: { scale: number; x: number; y: number }, pointer: { x: number; y: number }) {
  return { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
}

describe("constants", () => {
  it("steps by 1.1 per notch, caps at 1600% and fits with a 24 px margin up to 400%", () => {
    expect(ZOOM_STEP).toBe(1.1);
    expect(MAX_SCALE).toBe(16);
    expect(MAX_FIT_SCALE).toBe(4);
    expect(FIT_MARGIN).toBe(24);
  });
});

describe("fitViewport", () => {
  it("fits the image inside the container minus the margin and centers it", () => {
    const view = fitViewport({ width: 800, height: 600 }, { width: 300, height: 200 });

    expect(view.scale).toBeCloseTo(Math.min(752 / 300, 552 / 200, 4), 12);
    expect(view.x).toBeCloseTo((800 - 300 * view.scale) / 2, 9);
    expect(view.y).toBeCloseTo((600 - 200 * view.scale) / 2, 9);
  });

  it("magnifies a tiny image only up to 400%", () => {
    const view = fitViewport({ width: 800, height: 600 }, { width: 10, height: 10 });

    expect(view.scale).toBe(4);
  });

  it("shrinks a large image to fit", () => {
    const view = fitViewport({ width: 800, height: 600 }, { width: 8000, height: 6000 });

    expect(view.scale).toBeCloseTo(552 / 6000, 12);
  });

  it.each([
    ["a 0 x 0 container", { width: 0, height: 0 }],
    ["a NaN container", { width: Number.NaN, height: 600 }],
    ["a container smaller than the margin", { width: 20, height: 20 }],
  ])("falls back to scale 1 with finite coordinates for %s", (_label, container) => {
    const view = fitViewport(container, { width: 300, height: 200 });

    expect(view.scale).toBe(1);
    expect(Number.isFinite(view.x)).toBe(true);
    expect(Number.isFinite(view.y)).toBe(true);
  });

  it("falls back to scale 1 for an image with no size", () => {
    const view = fitViewport({ width: 800, height: 600 }, { width: 0, height: 0 });

    expect(view.scale).toBe(1);
    expect(Number.isFinite(view.x)).toBe(true);
  });
});

describe("zoomLimits", () => {
  it("allows half the fit scale up to 1600%", () => {
    expect(zoomLimits(2)).toEqual({ min: 1, max: 16 });
  });
});

describe("zoomAt", () => {
  const limits = zoomLimits(2.5);
  const start = { scale: 2.5, x: 24, y: 50 };

  it.each([
    [{ x: 400, y: 300 }, 1.1],
    [{ x: 0, y: 0 }, 1.1],
    [{ x: 799, y: 12 }, 1 / 1.1],
    [{ x: 123.5, y: 456.25 }, 1.1],
    [{ x: 640, y: 480 }, 3],
  ])("keeps the image point under the pointer %j fixed at factor %d", (pointer, factor) => {
    const before = imagePoint(start, pointer);
    const next = zoomAt(start, pointer, factor, limits);
    const after = imagePoint(next, pointer);

    expect(next.scale).toBeCloseTo(start.scale * factor, 9);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("never exceeds the maximum scale and does not drift at the limit", () => {
    const atMax = zoomAt({ scale: 15.5, x: -30, y: 12 }, { x: 200, y: 100 }, 1.1, limits);
    expect(atMax.scale).toBe(16);

    const again = zoomAt(atMax, { x: 500, y: 400 }, 1.1, limits);
    expect(again).toEqual(atMax);
  });

  it("never drops below fit x 0.5 and does not drift at the limit", () => {
    const atMin = zoomAt({ scale: 1.3, x: 40, y: 60 }, { x: 200, y: 100 }, 1 / 1.1, limits);
    expect(atMin.scale).toBeCloseTo(2.5 * 0.5, 12);

    const again = zoomAt(atMin, { x: 500, y: 400 }, 1 / 1.1, limits);
    expect(again).toEqual(atMin);
  });

  it("keeps the anchor fixed while it clamps to a limit", () => {
    const pointer = { x: 333, y: 222 };
    const view = { scale: 15.9, x: -100, y: -40 };
    const before = imagePoint(view, pointer);

    const next = zoomAt(view, pointer, 1.1, limits);
    const after = imagePoint(next, pointer);

    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("ignores a factor that is not a positive finite number", () => {
    expect(zoomAt(start, { x: 1, y: 1 }, 0, limits)).toEqual(start);
    expect(zoomAt(start, { x: 1, y: 1 }, Number.NaN, limits)).toEqual(start);
    expect(zoomAt(start, { x: 1, y: 1 }, -2, limits)).toEqual(start);
  });
});

describe("panBy", () => {
  it("shifts x and y only", () => {
    expect(panBy({ scale: 2, x: 5, y: 7 }, 10, -5)).toEqual({ scale: 2, x: 15, y: 2 });
  });
});
