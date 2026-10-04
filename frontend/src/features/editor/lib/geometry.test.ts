import { describe, expect, it } from "vitest";

import { isTiny, rectFromDrag, round6, toNorm, toPx } from "./geometry";
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
