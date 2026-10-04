import { act, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { type Mock, afterEach, describe, expect, it } from "vitest";

import { AppRoutes } from "../../app/routes";
import {
  firePointer,
  getStage,
  installPointerCaptureStubs,
  stubElementSize,
  stubImageDecoding,
} from "../../test/canvas";
import { type NeighborsFixture, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { resetEditorUi } from "./store/editorUiStore";
import { peekEditor, resetEditors } from "./store/storeRegistry";

const MIDDLE: NeighborsFixture = { position: 2, total: 3, prev_id: 4, next_id: 6 };
const ROUTE = "/projects/1/annotate/5?sort=name&q=img";

/** Every location the router visited, in order (a repeated navigation shows up twice). */
const visited: string[] = [];

function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    visited.push(`${location.pathname}${location.search}`);
  }, [location]);
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function currentLocation(): string {
  return screen.getByTestId("location").textContent ?? "";
}

function setUpCanvas(): void {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
}

async function openEditor(neighbors: NeighborsFixture = MIDDLE, route = ROUTE) {
  setUpCanvas();
  const api = stubEditorApi({ neighbors });
  const rendered = renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route },
  );
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return { ...rendered, ...api };
}

function drag(from: [number, number], to: [number, number]): void {
  const content = getStage().content;
  firePointer(content, "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content, "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content, "pointerup", { clientX: to[0], clientY: to[1] });
}

function press(init: KeyboardEventInit): void {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const prevButton = () => screen.getByRole("button", { name: "Previous image" });
const nextButton = () => screen.getByRole("button", { name: "Next image" });

afterEach(() => {
  resetEditors();
  resetEditorUi();
  visited.length = 0;
});

describe("position and neighbors request", () => {
  it("asks for the neighbors with the URL's sort and search and shows the position", async () => {
    const { neighborRequests } = await openEditor();

    await screen.findByText("2 of 3");
    expect(neighborRequests).toHaveLength(1);
    expect(neighborRequests[0].get("sort")).toBe("name");
    expect(neighborRequests[0].get("q")).toBe("img");
  });

  it("hides the counter when the image is outside the search, arrows still follow the grid", async () => {
    await openEditor({ position: null, total: 3, prev_id: 4, next_id: 6 });

    await waitFor(() => expect(nextButton()).toBeEnabled());
    expect(prevButton()).toBeEnabled();
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
  });

  it("disables the previous arrow on the first position", async () => {
    await openEditor({ position: 1, total: 3, prev_id: null, next_id: 6 });

    await screen.findByText("1 of 3");
    expect(prevButton()).toBeDisabled();
    expect(nextButton()).toBeEnabled();
  });

  it("disables the next arrow on the last position", async () => {
    await openEditor({ position: 3, total: 3, prev_id: 4, next_id: null });

    await screen.findByText("3 of 3");
    expect(nextButton()).toBeDisabled();
    expect(prevButton()).toBeEnabled();
  });

  it("disables both arrows for 1 of 1", async () => {
    await openEditor({ position: 1, total: 1, prev_id: null, next_id: null });

    await screen.findByText("1 of 1");
    expect(prevButton()).toBeDisabled();
    expect(nextButton()).toBeDisabled();
  });
});

describe("navigation controls", () => {
  it("goes to the next image keeping the grid's sort and search", async () => {
    const { user } = await openEditor();
    await waitFor(() => expect(nextButton()).toBeEnabled());

    await user.click(nextButton());

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
  });

  it("goes to the previous image keeping the grid's sort and search", async () => {
    const { user } = await openEditor();
    await waitFor(() => expect(prevButton()).toBeEnabled());

    await user.click(prevButton());

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/4?sort=name&q=img"));
  });

  it("goes back to the grid with the same sort and search", async () => {
    const { user } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Back to images" }));

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/images?sort=name&q=img"));
  });

  it("saves the drawn box before the location changes", async () => {
    const { puts, setPutMode, releasePuts } = await openEditor();
    setPutMode("hold");
    await screen.findByText("2 of 3");

    drag([100, 100], [400, 300]);
    press({ code: "KeyD", key: "d" });

    // The flush sent the PUT at once (no debounce wait) and navigation waits for it.
    await waitFor(() => expect(puts).toHaveLength(1));
    await sleep(100);
    expect(currentLocation()).toBe(ROUTE);

    releasePuts();

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
    expect(puts).toHaveLength(1);
  });

  it("shows the loading state on the clicked control and stops drawing while it waits", async () => {
    const { puts, setPutMode, releasePuts, user } = await openEditor();
    setPutMode("hold");
    await screen.findByText("2 of 3");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(peekEditor({ projectId: 1, imageId: 5 })?.saver.isDirty()).toBe(true));

    await user.click(nextButton());

    await waitFor(() => expect(nextButton()).toHaveAttribute("data-loading", "true"));
    expect(prevButton()).not.toHaveAttribute("data-loading");
    drag([20, 20], [90, 90]);
    expect(peekEditor({ projectId: 1, imageId: 5 })?.store.getState().doc.boxes).toHaveLength(1);

    releasePuts();

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
    expect(puts).toHaveLength(1);
  });
});

describe("keyboard navigation", () => {
  it("D goes to the next image", async () => {
    await openEditor();
    await waitFor(() => expect(nextButton()).toBeEnabled());

    press({ code: "KeyD", key: "d" });

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
  });

  it("A goes to the previous image", async () => {
    await openEditor();
    await waitFor(() => expect(prevButton()).toBeEnabled());

    press({ code: "KeyA", key: "a" });

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/4?sort=name&q=img"));
  });

  it("the right arrow goes to the next image", async () => {
    await openEditor();
    await waitFor(() => expect(nextButton()).toBeEnabled());

    press({ code: "ArrowRight", key: "ArrowRight" });

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
  });

  it("the left arrow goes to the previous image", async () => {
    await openEditor();
    await waitFor(() => expect(prevButton()).toBeEnabled());

    press({ code: "ArrowLeft", key: "ArrowLeft" });

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/4?sort=name&q=img"));
  });

  it("the D key of the Russian layout goes to the next image", async () => {
    await openEditor();
    await waitFor(() => expect(nextButton()).toBeEnabled());

    press({ code: "KeyD", key: "в" });

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
  });

  it("does not repeat navigation for a held key", async () => {
    await openEditor();
    await waitFor(() => expect(nextButton()).toBeEnabled());

    press({ code: "KeyD", key: "d", repeat: true });
    press({ code: "ArrowRight", key: "ArrowRight", repeat: true });
    await sleep(150);

    expect(currentLocation()).toBe(ROUTE);
  });

  it("does not go past the last image: D on the last position stays", async () => {
    await openEditor({ position: 3, total: 3, prev_id: 4, next_id: null });
    await screen.findByText("3 of 3");

    press({ code: "KeyD", key: "d" });
    await sleep(150);

    expect(currentLocation()).toBe(ROUTE);
  });

  it("moves exactly one image for a burst of D presses while the save is pending", async () => {
    const { puts, setPutMode, releasePuts } = await openEditor();
    setPutMode("hold");
    await screen.findByText("2 of 3");
    drag([100, 100], [400, 300]);

    press({ code: "KeyD", key: "d" });
    await waitFor(() => expect(puts).toHaveLength(1));
    press({ code: "KeyD", key: "d" });
    press({ code: "KeyD", key: "d" });
    press({ code: "KeyD", key: "d" });
    await sleep(100);
    expect(currentLocation()).toBe(ROUTE);

    releasePuts();
    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/6?sort=name&q=img"));
    await sleep(150);

    expect(visited.filter((entry) => entry.startsWith("/projects/1/annotate/6"))).toHaveLength(1);
    expect(puts).toHaveLength(1);
  });
});

describe("prefetch", () => {
  it("requests the originals of the previous and next images once the neighbors are known", async () => {
    await openEditor();
    await screen.findByText("2 of 3");

    // `stubImageDecoding` made the `src` setter a spy: its calls are every requested source.
    const setter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")
      ?.set as Mock<(value: string) => void>;
    await waitFor(() => {
      const requested = setter.mock.calls.map(([value]) => value);
      expect(requested).toContain("/api/projects/1/images/4/file");
      expect(requested).toContain("/api/projects/1/images/6/file");
    });
  });
});
