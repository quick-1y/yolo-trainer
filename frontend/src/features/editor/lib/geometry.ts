/**
 * Pure box geometry. Boxes are stored normalized (top-left x/y and size w/h in
 * [0, 1]) relative to the EXIF-oriented image; the canvas works in image pixels.
 */

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in image pixels. */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle normalized to [0, 1] of the image. */
export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Drags smaller than this many SCREEN pixels in width or height create nothing (D-08). */
export const MIN_DRAW_SCREEN_PX = 4;

/** Round to 6 decimals so JSON round-trips exactly (the server compares sets this way). */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The rectangle spanned by a drag from `start` to `end` (any direction), with
 * both corners clipped to the image bounds [0, imgW] x [0, imgH].
 */
export function rectFromDrag(start: Point, end: Point, imgW: number, imgH: number): PxRect {
  const x1 = clamp(start.x, 0, imgW);
  const y1 = clamp(start.y, 0, imgH);
  const x2 = clamp(end.x, 0, imgW);
  const y2 = clamp(end.y, 0, imgH);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** Pixel rectangle to a normalized box, rounded and kept inside the image. */
export function toNorm(rect: PxRect, imgW: number, imgH: number): NormBox {
  const x = round6(rect.x / imgW);
  const y = round6(rect.y / imgH);
  return {
    x,
    y,
    // Rounding must never push x + w past 1 (the server rejects boxes outside the image).
    w: Math.min(round6(rect.w / imgW), round6(1 - x)),
    h: Math.min(round6(rect.h / imgH), round6(1 - y)),
  };
}

/** Normalized box back to image pixels. */
export function toPx(box: NormBox, imgW: number, imgH: number): PxRect {
  return { x: box.x * imgW, y: box.y * imgH, w: box.w * imgW, h: box.h * imgH };
}

/** True when the rectangle is below the minimum size on screen at `scale` (screen px per image px). */
export function isTiny(
  rect: PxRect,
  scale: number,
  minScreenPx: number = MIN_DRAW_SCREEN_PX,
): boolean {
  return rect.w * scale < minScreenPx || rect.h * scale < minScreenPx;
}
