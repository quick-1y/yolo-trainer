import { act } from "@testing-library/react";
import Konva from "konva";
import { vi } from "vitest";

/**
 * Make `new Image()` decode instantly in jsdom: setting `src` defines the
 * natural size and fires `load` on a microtask (jsdom never loads images).
 */
export function stubImageDecoding(width: number, height: number): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (
    this: HTMLImageElement,
    value: string,
  ) {
    descriptor?.set?.call(this, value);
    Object.defineProperty(this, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(this, "naturalHeight", { configurable: true, value: height });
    Object.defineProperty(this, "complete", { configurable: true, value: true });
    queueMicrotask(() => this.dispatchEvent(new Event("load")));
  });
}

/**
 * Give every element a layout size (jsdom reports 0 x 0): the container is
 * measured through getBoundingClientRect, and Konva divides that rect by
 * clientWidth/clientHeight to find its content scale.
 */
export function stubElementSize(width: number, height: number): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(height);
}

/** jsdom has no pointer capture; the editor only needs the calls not to throw. */
export function installPointerCaptureStubs(): void {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  for (const name of ["setPointerCapture", "releasePointerCapture"]) {
    if (typeof proto[name] !== "function") {
      Object.defineProperty(proto, name, { configurable: true, writable: true, value: () => {} });
    }
  }
  if (typeof proto.hasPointerCapture !== "function") {
    Object.defineProperty(proto, "hasPointerCapture", {
      configurable: true,
      writable: true,
      value: () => false,
    });
  }
}

interface PointerOptions {
  clientX: number;
  clientY: number;
  button?: number;
  pointerId?: number;
}

/** Dispatch a pointer event (inside `act`, so React state updates flush). */
export function firePointer(target: Element, type: string, options: PointerOptions): void {
  const { clientX, clientY, button = 0, pointerId = 1 } = options;
  const init = { bubbles: true, cancelable: true, clientX, clientY, button, pointerId };
  const event =
    typeof PointerEvent === "function"
      ? new PointerEvent(type, init)
      : Object.assign(new MouseEvent(type, init), { pointerId });
  act(() => {
    target.dispatchEvent(event);
  });
}

/** The most recently created Konva stage. */
export function getStage(): Konva.Stage {
  const stage = Konva.stages[Konva.stages.length - 1];
  if (stage === undefined) {
    throw new Error("No Konva stage is mounted");
  }
  return stage;
}
