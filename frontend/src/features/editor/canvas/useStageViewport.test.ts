import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fitViewport } from "../lib/viewport";
import { useStageViewport } from "./useStageViewport";

const CONTAINER = { width: 800, height: 600 };
const IMAGE = { width: 300, height: 200 };

type Props = {
  container: { width: number; height: number };
  image: { width: number; height: number };
  imageKey: unknown;
};

function mount(initial: Partial<Props> = {}) {
  return renderHook(
    (props: Props) => useStageViewport(props.container, props.image, props.imageKey),
    { initialProps: { container: CONTAINER, image: IMAGE, imageKey: "a", ...initial } },
  );
}

describe("useStageViewport", () => {
  it("starts fit", () => {
    const { result } = mount();

    expect(result.current.view).toEqual(fitViewport(CONTAINER, IMAGE));
    expect(result.current.fitScale).toBe(result.current.view.scale);
  });

  it("zooms around the container center by default and fits again on request", () => {
    const { result } = mount();
    const fit = result.current.view;

    act(() => result.current.zoomBy(1.1));

    expect(result.current.view.scale).toBeCloseTo(fit.scale * 1.1, 9);
    const anchor = (value: number, pos: number, scale: number) => (value - pos) / scale;
    expect(anchor(400, result.current.view.x, result.current.view.scale)).toBeCloseTo(
      anchor(400, fit.x, fit.scale),
      9,
    );

    act(() => result.current.fit());

    expect(result.current.view).toEqual(fit);
  });

  it("accumulates several zooms issued before a render", () => {
    const { result } = mount();
    const fit = result.current.view.scale;

    act(() => {
      result.current.zoomBy(1.1, { x: 10, y: 10 });
      result.current.zoomBy(1.1, { x: 10, y: 10 });
    });

    expect(result.current.view.scale).toBeCloseTo(fit * 1.21, 9);
  });

  it("refits when the image changes, even after the user zoomed", () => {
    const { result, rerender } = mount();
    act(() => result.current.zoomBy(1.1));

    rerender({ container: CONTAINER, image: IMAGE, imageKey: "b" });

    expect(result.current.view).toEqual(fitViewport(CONTAINER, IMAGE));
  });

  it("refits when the image size changes", () => {
    const { result, rerender } = mount();
    act(() => result.current.zoomBy(1.1));
    const bigger = { width: 600, height: 400 };

    rerender({ container: CONTAINER, image: bigger, imageKey: "a" });

    expect(result.current.view).toEqual(fitViewport(CONTAINER, bigger));
  });

  it("follows a container resize until the user zooms", () => {
    const { result, rerender } = mount();
    const resized = { width: 500, height: 500 };

    rerender({ container: resized, image: IMAGE, imageKey: "a" });
    expect(result.current.view).toEqual(fitViewport(resized, IMAGE));

    act(() => result.current.zoomBy(1.1));
    const zoomed = result.current.view;
    rerender({ container: CONTAINER, image: IMAGE, imageKey: "a" });

    expect(result.current.view).toEqual(zoomed);
    expect(result.current.fitScale).toBe(fitViewport(CONTAINER, IMAGE).scale);
  });

  it("commits a pan through setView", () => {
    const { result } = mount();
    const view = { ...result.current.view, x: 12, y: 34 };

    act(() => result.current.setView(view));

    expect(result.current.view).toEqual(view);
  });
});
