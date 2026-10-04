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
