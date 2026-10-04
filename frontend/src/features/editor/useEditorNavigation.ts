import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { peekEditor } from "./store/storeRegistry";

/** The control that started a navigation; it shows the loading state while the save is awaited. */
export type NavControl = "prev" | "next" | "back" | "nextUnannotated";

/** State and actions of the "Changes could not be saved" dialog (D-11). */
export interface LeaveDialogState {
  open: boolean;
  /** A retry is running. */
  retrying: boolean;
  /** Save again, then leave once it succeeds; the dialog stays open if it fails. */
  retry: () => Promise<void>;
  /** Leave now, keeping the unsaved work in the registry. */
  leaveAnyway: () => void;
  /** Stay on the image. */
  close: () => void;
}

export interface EditorNavigation {
  /**
   * Leave the image for `path`: first await the image's saver flush, then navigate.
   * Ignored while another navigation is pending or the leave dialog is open (one at a time).
   */
  goTo: (path: string, control: NavControl) => Promise<void>;
  /** The control whose navigation is waiting for the save, or null. */
  pending: NavControl | null;
  leave: LeaveDialogState;
}

/**
 * The one way out of an image (RESEARCH Pitfall 12: there is no `useBlocker` under
 * `BrowserRouter`, so leaving must be an explicit, awaited step). Every in-editor move
 * - prev, next, next unannotated, Back - goes through `goTo`. A failed or conflicting save
 * never navigates silently: it opens the leave dialog.
 */
export function useEditorNavigation(projectId: number, imageId: number): EditorNavigation {
  const navigate = useNavigate();
  const [pending, setPending] = useState<NavControl | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Refs as well as state: a burst of key presses can arrive before React re-renders.
  const busy = useRef(false);
  const targetRef = useRef<string | null>(null);
  // Bumped when the dialog closes, so a retry still running cannot navigate afterwards.
  const generation = useRef(0);

  const flushCurrent = useCallback(
    async () => (await peekEditor({ projectId, imageId })?.saver.flush()) ?? "saved",
    [projectId, imageId],
  );

  const setLeaveTarget = useCallback((path: string | null) => {
    targetRef.current = path;
    setTarget(path);
  }, []);

  const goTo = useCallback(
    async (path: string, control: NavControl) => {
      if (busy.current || targetRef.current !== null) {
        return;
      }
      busy.current = true;
      setPending(control);
      try {
        const outcome = await flushCurrent();
        if (outcome === "saved") {
          navigate(path);
        } else {
          setLeaveTarget(path);
        }
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [flushCurrent, navigate, setLeaveTarget],
  );

  const retry = useCallback(async () => {
    const path = targetRef.current;
    if (path === null || busy.current) {
      return;
    }
    busy.current = true;
    const mine = generation.current;
    setRetrying(true);
    try {
      const outcome = await flushCurrent();
      if (outcome === "saved" && generation.current === mine) {
        setLeaveTarget(null);
        navigate(path);
      }
    } finally {
      busy.current = false;
      setRetrying(false);
    }
  }, [flushCurrent, navigate, setLeaveTarget]);

  const leaveAnyway = useCallback(() => {
    const path = targetRef.current;
    if (path === null) {
      return;
    }
    generation.current += 1;
    setLeaveTarget(null);
    navigate(path);
  }, [navigate, setLeaveTarget]);

  const close = useCallback(() => {
    generation.current += 1;
    setLeaveTarget(null);
  }, [setLeaveTarget]);

  return {
    goTo,
    pending,
    leave: { open: target !== null, retrying, retry, leaveAnyway, close },
  };
}
