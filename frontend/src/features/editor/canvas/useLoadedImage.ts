import { useCallback, useEffect, useState } from "react";

/**
 * - `loading`: the original is still being fetched or decoded.
 * - `loaded`: decoded, and its size is the stored one.
 * - `mismatch`: decoded, but the browser's size differs from the stored one (the image is still
 *   returned so it can be shown; boxes must not be stored against it).
 * - `error`: the browser could not load it.
 */
export type LoadStatus = "loading" | "loaded" | "mismatch" | "error";

/** The size the database stores for the image (EXIF-oriented, P2 D-17). */
export interface ExpectedSize {
  width: number;
  height: number;
}

interface LoadState {
  src: string;
  status: "loading" | "loaded" | "error";
  image: HTMLImageElement | null;
}

export interface LoadedImage {
  status: LoadStatus;
  image: HTMLImageElement | null;
  /** Load the original again (a fresh `src` assignment), after an `error`. */
  retry: () => void;
}

/**
 * Loads `src` into an off-screen HTMLImageElement. The state is keyed by `src`,
 * so a new source starts again at "loading" without a stale image ever showing.
 *
 * With `expected` the decoded size is compared with the stored one once the image has loaded:
 * Chromium ignores the EXIF orientation of a WebP, so such a file decodes rotated against the
 * dimensions the server computed (Pitfall 4) and every normalized box would land on the wrong
 * pixels. A difference reports `mismatch` (checked on every render, so a corrected stored size
 * clears it).
 */
export function useLoadedImage(src: string, expected?: ExpectedSize): LoadedImage {
  const [state, setState] = useState<LoadState>({ src, status: "loading", image: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = new window.Image();
    let active = true;
    element.onload = () => {
      if (active) {
        setState({ src, status: "loaded", image: element });
      }
    };
    element.onerror = () => {
      if (active) {
        setState({ src, status: "error", image: null });
      }
    };
    element.src = src;
    return () => {
      active = false;
      element.onload = null;
      element.onerror = null;
    };
  }, [src, attempt]);

  const retry = useCallback(() => {
    setState({ src, status: "loading", image: null });
    setAttempt((count) => count + 1);
  }, [src]);

  if (state.src !== src) {
    return { status: "loading", image: null, retry };
  }
  const { image } = state;
  if (
    state.status === "loaded" &&
    image !== null &&
    expected !== undefined &&
    (image.naturalWidth !== expected.width || image.naturalHeight !== expected.height)
  ) {
    return { status: "mismatch", image, retry };
  }
  return { status: state.status, image, retry };
}
