import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { peekEditor } from "./store/storeRegistry";

/** The control that started a navigation; it shows the loading state while the save is awaited. */
export type NavControl = "prev" | "next" | "back" | "nextUnannotated";

export interface EditorNavigation {
  /**
   * Leave the image for `path`: first await the image's saver flush, then navigate.
   * Ignored while another navigation is pending (one at a time).
   */
  goTo: (path: string, control: NavControl) => Promise<void>;
  /** The control whose navigation is waiting for the save, or null. */
  pending: NavControl | null;
}

/**
 * The one way out of an image (RESEARCH Pitfall 12: there is no `useBlocker` under
 * `BrowserRouter`, so leaving must be an explicit, awaited step). Every in-editor move
 * - prev, next, next unannotated, Back - goes through `goTo`.
 */
export function useEditorNavigation(projectId: number, imageId: number): EditorNavigation {
  const navigate = useNavigate();
  const [pending, setPending] = useState<NavControl | null>(null);
  // A ref as well as state: a burst of key presses can arrive before React re-renders.
  const busy = useRef(false);

  const goTo = useCallback(
    async (path: string, control: NavControl) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setPending(control);
      try {
        const outcome = (await peekEditor({ projectId, imageId })?.saver.flush()) ?? "saved";
        if (outcome === "saved") {
          navigate(path);
        }
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [navigate, projectId, imageId],
  );

  return { goTo, pending };
}
