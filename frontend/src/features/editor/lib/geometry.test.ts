import { describe, expect, it } from "vitest";

import {
  clampMove,
  isTiny,
  normalizeTransform,
  rectFromDrag,
  round6,
  toNorm,
  toPx,
} from "./geometry";
import { newId } from "./ids";
import { editorPath, imagesPath, readGridParams } from "./urls";

describe("geometry", () => {
  it("rectFromDrag normalizes the direction and clips both corners to the image", () => {
    expect(rectFromDrag({ x: 50, y: 40 }, { x: 10, y: 5 }, 100, 80)).toEqual({
      x: 10,
      y: 5,
      w: 40,
      h: 35,
    });
    expect(rectFromDrag({ x: -20, y: 70 }, { x: 150, y: 200 }, 100, 80)).toEqual({
      x: 0,
      y: 70,
      w: 100,
      h: 10,
    });
  });

  it("toNorm rounds to 6 decimals and never lets x + w pass 1", () => {
    const norm = toNorm({ x: 1, y: 0, w: 2, h: 80 }, 3, 80);
    expect(norm.x + norm.w).toBeLessThanOrEqual(1);
    expect(norm.h).toBe(1);
    expect(toNorm({ x: 10, y: 20, w: 30, h: 40 }, 300, 200)).toEqual({
      x: round6(10 / 300),
      y: 0.1,
      w: 0.1,
      h: 0.2,
    });
  });

  it("toPx inverts toNorm", () => {
    expect(toPx({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 300, 200)).toEqual({
      x: 30,
      y: 20,
      w: 150,
      h: 100,
    });
  });

  it("isTiny compares the size on screen with the 4 px threshold", () => {
    expect(isTiny({ x: 0, y: 0, w: 1.9, h: 100 }, 2)).toBe(true);
    expect(isTiny({ x: 0, y: 0, w: 2, h: 2 }, 2)).toBe(false);
    expect(isTiny({ x: 0, y: 0, w: 100, h: 3 }, 1)).toBe(true);
  });
});

describe("geometry: drag, rounding and size rules", () => {
  it("rectFromDrag clips an end point outside the image to the edge", () => {
    expect(rectFromDrag({ x: 50, y: 40 }, { x: 10, y: 10 }, 300, 200)).toEqual({
      x: 10,
      y: 10,
      w: 40,
      h: 30,
    });
    expect(rectFromDrag({ x: 50, y: 40 }, { x: 350, y: -20 }, 300, 200)).toEqual({
      x: 50,
      y: 0,
      w: 250,
      h: 40,
    });
  });

  it("toNorm(toPx(b)) gives b back for a 6-decimal box", () => {
    const box = { x: 0.123457, y: 0.2, w: 0.3, h: 0.4 };
    expect(toNorm(toPx(box, 300, 200), 300, 200)).toEqual(box);
  });

  it("isTiny depends on the screen size, not the image size", () => {
    const rect = { x: 0, y: 0, w: 3, h: 40 };
    expect(isTiny(rect, 1)).toBe(true);
    expect(isTiny(rect, 2)).toBe(false);
  });
});

describe("clampMove", () => {
  it("shifts a box that sticks out back inside the image without resizing it", () => {
    expect(clampMove({ x: 280, y: -5, w: 40, h: 30 }, 300, 200)).toEqual({
      x: 260,
      y: 0,
      w: 40,
      h: 30,
    });
    expect(clampMove({ x: -12, y: 190, w: 40, h: 30 }, 300, 200)).toEqual({
      x: 0,
      y: 170,
      w: 40,
      h: 30,
    });
  });

  it("leaves a box that is inside untouched", () => {
    const rect = { x: 10, y: 20, w: 40, h: 30 };
    expect(clampMove(rect, 300, 200)).toEqual(rect);
  });

  it("caps a box larger than the image to the image", () => {
    expect(clampMove({ x: 5, y: 5, w: 400, h: 250 }, 300, 200)).toEqual({
      x: 0,
      y: 0,
      w: 300,
      h: 200,
    });
  });
});

describe("normalizeTransform", () => {
  it("clips to the image and enforces one image pixel", () => {
    expect(normalizeTransform({ x: -10, y: 5, w: 50, h: 0.2 }, 300, 200)).toEqual({
      x: 0,
      y: 5,
      w: 40,
      h: 1,
    });
  });

  it("turns a negative size into the same box on the other side", () => {
    expect(normalizeTransform({ x: 100, y: 80, w: -40, h: -30 }, 300, 200)).toEqual({
      x: 60,
      y: 50,
      w: 40,
      h: 30,
    });
  });

  it("keeps the one pixel minimum inside the image at the far edge", () => {
    expect(normalizeTransform({ x: 300, y: 200, w: 0, h: 0 }, 300, 200)).toEqual({
      x: 299,
      y: 199,
      w: 1,
      h: 1,
    });
  });

  it("never returns a box that is not strictly positive or sticks out", () => {
    for (const rect of [
      { x: 250, y: 150, w: 400, h: 400 },
      { x: -50, y: -50, w: -20, h: -20 },
      { x: 10, y: 10, w: 0.001, h: 5000 },
    ]) {
      const out = normalizeTransform(rect, 300, 200);
      expect(out.w).toBeGreaterThanOrEqual(1);
      expect(out.h).toBeGreaterThanOrEqual(1);
      expect(out.x).toBeGreaterThanOrEqual(0);
      expect(out.y).toBeGreaterThanOrEqual(0);
      expect(out.x + out.w).toBeLessThanOrEqual(300);
      expect(out.y + out.h).toBeLessThanOrEqual(200);
    }
  });
});

describe("newId", () => {
  it("builds a v4 UUID without crypto.randomUUID", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(id);
  });
});

describe("urls", () => {
  it("omits default params and keeps sort=name and a non-empty q", () => {
    expect(imagesPath(3, { sort: "newest", q: "" })).toBe("/projects/3/images");
    expect(imagesPath(3, { sort: "name", q: "cat" })).toBe("/projects/3/images?sort=name&q=cat");
    expect(editorPath(3, 9, { sort: "name" })).toBe("/projects/3/annotate/9?sort=name");
  });

  it("readGridParams falls back to the grid defaults and trims q", () => {
    expect(readGridParams(new URLSearchParams("sort=bogus&q=%20dog%20"))).toEqual({
      sort: "newest",
      q: "dog",
    });
    expect(readGridParams(new URLSearchParams("sort=name"))).toEqual({ sort: "name", q: "" });
  });
});
