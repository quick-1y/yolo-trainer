/**
 * Pure zoom and pan math for the annotation stage. The Stage carries the
 * viewport (`scale`, `x`, `y`), the image is drawn at natural size at the
 * layer origin, so a screen point `p` shows the image point `(p - pos) / scale`.
 */

/** A stage transform: `scale` screen px per image px, `x`/`y` the screen position of the image origin. */
export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

/** One wheel notch zooms by this factor (zoom out divides by it). */
export const ZOOM_STEP = 1.1;
/** The largest zoom: 1600 % of the natural size. */
export const MAX_SCALE = 16;
/** A small image is magnified to fit at most 400 %, never beyond. */
export const MAX_FIT_SCALE = 4;
/** Free space kept around the image when it is fitted to the window (px a side). */
export const FIT_MARGIN = 24;
/** The smallest zoom is this fraction of the fit scale. */
const MIN_FIT_FRACTION = 0.5;

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * The viewport that fits the image into the container, centered. A zero,
 * negative or non-finite size (jsdom, the first layout tick, a container smaller
 * than the margin) falls back to scale 1 with finite coordinates.
 */
export function fitViewport(container: Size, image: Size): Viewport {
  const scale = Math.min(
    (container.width - 2 * FIT_MARGIN) / image.width,
    (container.height - 2 * FIT_MARGIN) / image.height,
    MAX_FIT_SCALE,
  );
  const hasImage = isPositive(image.width) && isPositive(image.height);
  const safeScale = hasImage && isPositive(scale) ? scale : 1;
  const x = (container.width - image.width * safeScale) / 2;
  const y = (container.height - image.height * safeScale) / 2;
  return {
    scale: safeScale,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

/** Zoom range for an image whose fit scale is `fitScale`: half of fit up to 1600 %. */
export function zoomLimits(fitScale: number): ZoomLimits {
  return { min: fitScale * MIN_FIT_FRACTION, max: MAX_SCALE };
}

/**
 * Zoom by `factor` keeping the image point under `pointer` where it is. The new
 * scale is clamped to `limits`; at a limit the position stays put (no drift). A
 * factor that is not a positive finite number changes nothing.
 */
export function zoomAt(
  view: Viewport,
  pointer: ScreenPoint,
  factor: number,
  limits: ZoomLimits,
): Viewport {
  if (!isPositive(factor)) {
    return view;
  }
  const scale = Math.min(limits.max, Math.max(limits.min, view.scale * factor));
  if (scale === view.scale) {
    return view;
  }
  const anchorX = (pointer.x - view.x) / view.scale;
  const anchorY = (pointer.y - view.y) / view.scale;
  return { scale, x: pointer.x - anchorX * scale, y: pointer.y - anchorY * scale };
}

/** Move the image by a screen-pixel delta; the scale is untouched. */
export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return { scale: view.scale, x: view.x + dx, y: view.y + dy };
}
