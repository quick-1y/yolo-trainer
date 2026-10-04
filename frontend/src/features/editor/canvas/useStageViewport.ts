import { useCallback, useMemo, useRef, useState } from "react";

import {
  type ScreenPoint,
  type Size,
  type Viewport,
  fitViewport,
  zoomAt,
  zoomLimits,
} from "../lib/viewport";

/** A view the user set (zoom or pan), valid only for the image and size it was set on. */
interface Override {
  imageKey: unknown;
  width: number;
  height: number;
  view: Viewport;
}

export interface StageViewport {
  /** What the Stage shows now: the user's view, else the fit. */
  view: Viewport;
  /** Scale that fits the image to the container (the zoom limits are relative to it). */
  fitScale: number;
  /** Zoom by `factor` around `pointer` (default: the container center). */
  zoomBy: (factor: number, pointer?: ScreenPoint) => void;
  /** Adopt a view the stage itself produced (the end of a pan). */
  setView: (view: Viewport) => void;
  /** Back to fit. */
  fit: () => void;
}

/**
 * The viewport of the annotation stage. Every image opens fit: the user's view
 * is dropped as soon as `imageKey` or the image size changes. While the user has
 * not zoomed or panned the view follows the container size.
 */
export function useStageViewport(
  container: Size,
  image: Size,
  imageKey: unknown,
): StageViewport {
  const fit = useMemo(
    () => fitViewport(container, image),
    [container.width, container.height, image.width, image.height],
  );
  const [override, setOverride] = useState<Override | null>(null);

  const valid =
    override !== null &&
    override.imageKey === imageKey &&
    override.width === image.width &&
    override.height === image.height;
  const view = valid ? override.view : fit;

  // The callbacks read the latest inputs from a ref: several wheel notches can arrive
  // before a render, and each must build on the one before it.
  const latest = useRef({ container, image, imageKey, fit });
  latest.current = { container, image, imageKey, fit };

  const commit = useCallback((next: (base: Viewport) => Viewport) => {
    setOverride((previous) => {
      const { image: size, imageKey: key, fit: fitted } = latest.current;
      const base =
        previous !== null &&
        previous.imageKey === key &&
        previous.width === size.width &&
        previous.height === size.height
          ? previous.view
          : fitted;
      return { imageKey: key, width: size.width, height: size.height, view: next(base) };
    });
  }, []);

  const zoomBy = useCallback(
    (factor: number, pointer?: ScreenPoint) => {
      commit((base) => {
        const { container: box, fit: fitted } = latest.current;
        const at = pointer ?? { x: box.width / 2, y: box.height / 2 };
        return zoomAt(base, at, factor, zoomLimits(fitted.scale));
      });
    },
    [commit],
  );

  const setView = useCallback((next: Viewport) => commit(() => next), [commit]);
  const fitAgain = useCallback(() => setOverride(null), []);

  return { view, fitScale: fit.scale, zoomBy, setView, fit: fitAgain };
}
