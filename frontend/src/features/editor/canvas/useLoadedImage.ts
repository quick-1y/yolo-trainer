import { useEffect, useState } from "react";

export type LoadStatus = "loading" | "loaded" | "error";

interface LoadState {
  src: string;
  status: LoadStatus;
  image: HTMLImageElement | null;
}

/**
 * Loads `src` into an off-screen HTMLImageElement. The state is keyed by `src`,
 * so a new source starts again at "loading" without a stale image ever showing.
 */
export function useLoadedImage(src: string): {
  status: LoadStatus;
  image: HTMLImageElement | null;
} {
  const [state, setState] = useState<LoadState>({ src, status: "loading", image: null });

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
  }, [src]);

  return state.src === src
    ? { status: state.status, image: state.image }
    : { status: "loading", image: null };
}
