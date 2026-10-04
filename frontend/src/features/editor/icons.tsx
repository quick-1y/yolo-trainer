import type { ReactNode } from "react";

/**
 * Inline editor icons (no icon package, UI-SPEC icon rule): a 24 x 24 viewBox
 * rendered at 20 x 20, 2px stroke in `currentColor`, no fill, hidden from
 * assistive technology (the button carries the label).
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The Select tool: a pointer arrow. */
export function SelectIcon() {
  return (
    <Icon>
      <path d="M5 3l14 8-6 2-2 6z" />
    </Icon>
  );
}

/** The Box tool: a rectangle with corner marks. */
export function BoxIcon() {
  return (
    <Icon>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <path d="M2 4h4M4 2v4M18 20h4M20 18v4" />
    </Icon>
  );
}

/** Undo: an arrow curving back to the left. */
export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  );
}

/** Redo: the mirror image of Undo. */
export function RedoIcon() {
  return (
    <Icon>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Icon>
  );
}

/** Object visible: an open eye. */
export function EyeIcon() {
  return (
    <Icon>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Object hidden: the eye struck through. */
export function EyeOffIcon() {
  return (
    <Icon>
      <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </Icon>
  );
}

/** Background: an empty frame with a diagonal slash (an image with no objects). */
export function BackgroundIcon() {
  return (
    <Icon>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 20L20 4" />
    </Icon>
  );
}
