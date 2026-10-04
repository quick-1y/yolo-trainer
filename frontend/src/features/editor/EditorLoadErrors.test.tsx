import { act, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

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
import { resetEditors } from "./store/storeRegistry";

const ROUTE = "/projects/1/annotate/5";
const NEXT_ROUTE = "/projects/1/annotate/6";
const FILE_URL = "/api/projects/1/images/5/file";
const MIDDLE: NeighborsFixture = { position: 2, total: 3, prev_id: 4, next_id: 6 };

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

const currentLocation = () => screen.getByTestId("location").textContent ?? "";

/**
 * Decode every image instantly at the given size, except that the first load of the editor's
 * original fails. Returns every `src` assigned, in order.
 */
function stubImageFailingOnce(width: number, height: number): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  const assigned: string[] = [];
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (
    this: HTMLImageElement,
    value: string,
  ) {
    descriptor?.set?.call(this, value);
    assigned.push(value);
    const failing = value === FILE_URL && assigned.filter((src) => src === FILE_URL).length === 1;
    Object.defineProperty(this, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(this, "naturalHeight", { configurable: true, value: height });
    queueMicrotask(() => this.dispatchEvent(new Event(failing ? "error" : "load")));
  });
  return assigned;
}

function setUpCanvas(): void {
  stubElementSize(800, 600);
  installPointerCaptureStubs();
}

function render() {
  return renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route: ROUTE },
  );
}

function drag(from: [number, number], to: [number, number]): void {
  const content = getStage().content;
  firePointer(content, "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content, "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content, "pointerup", { clientX: to[0], clientY: to[1] });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const boxButton = () => screen.getByRole("button", { name: "Box" });
const hasImage = () => getStage().findOne("Image") !== undefined;

beforeEach(() => {
  vi.mocked(notifications.show).mockClear();
});

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("an image the browser decodes at another size (Pitfall 4)", () => {
  async function openMismatched() {
    // The database stores 300 x 200; the decoder reports 200 x 300 (an EXIF-rotated WebP).
    stubImageDecoding(200, 300);
    setUpCanvas();
    const api = stubEditorApi();
    const rendered = render();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(hasImage()).toBe(true));
    return { ...rendered, ...api, alert };
  }

  it("shows the orientation banner, still draws the image and disables Box", async () => {
    const { alert } = await openMismatched();

    expect(within(alert).getByText("Image orientation mismatch")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Editing is disabled for this image.");
    expect(boxButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("sends nothing when the user drags", async () => {
    const { puts } = await openMismatched();

    drag([100, 100], [400, 300]);
    await sleep(600);

    expect(puts).toHaveLength(0);
    expect(screen.getByText("Objects: 0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("shows no banner when the sizes match", async () => {
    stubImageDecoding(300, 200);
    setUpCanvas();
    stubEditorApi();
    render();
    await screen.findByRole("application");
    await waitFor(() => expect(hasImage()).toBe(true));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(boxButton()).toBeEnabled();
  });
});

describe("an image that fails to load", () => {
  it("shows a red Alert with the message and Try again loads it again", async () => {
    const assigned = stubImageFailingOnce(300, 200);
    setUpCanvas();
    stubEditorApi();
    const { user } = render();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Error")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Could not load this image.");
    expect(boxButton()).toBeDisabled();
    expect(assigned.filter((src) => src === FILE_URL)).toHaveLength(1);

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(assigned.filter((src) => src === FILE_URL)).toHaveLength(2);
    await waitFor(() => expect(hasImage()).toBe(true));
    expect(boxButton()).toBeEnabled();
  });
});

describe("an image or annotations request that fails", () => {
  it("shows the API message, Try again refetches and the editor works afterwards", async () => {
    stubImageDecoding(300, 200);
    setUpCanvas();
    const { setAnnotationsError, annotationGets, puts } = stubEditorApi({
      annotationsError: "Database is locked.",
    });
    const { user } = render();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Error")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Database is locked.");
    expect(boxButton()).toBeDisabled();
    const before = annotationGets.length;

    setAnnotationsError(null);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(annotationGets.length).toBeGreaterThan(before);
    await waitFor(() => expect(hasImage()).toBe(true));
    await waitFor(() => expect(boxButton()).toBeEnabled());
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(puts).toHaveLength(1));
  });

  it("keeps the next image button working while the annotations failed", async () => {
    stubImageDecoding(300, 200);
    setUpCanvas();
    const { puts } = stubEditorApi({ annotationsError: "Database is locked.", neighbors: MIDDLE });
    const { user } = render();
    await screen.findByRole("alert");
    await screen.findByText("2 of 3");

    const next = screen.getByRole("button", { name: "Next image" });
    expect(next).toBeEnabled();
    await user.click(next);

    await waitFor(() => expect(currentLocation()).toBe(NEXT_ROUTE));
    expect(puts).toHaveLength(0);
  });

  it("shows the API message when the image detail fails and Try again refetches it", async () => {
    stubImageDecoding(300, 200);
    setUpCanvas();
    const { setImageError, fetchMock } = stubEditorApi({ imageError: "Database is locked." });
    const { user } = render();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database is locked.");
    const detailGets = () =>
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/projects/1/images/5").length;
    const before = detailGets();

    setImageError(null);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(detailGets()).toBeGreaterThan(before);
    await waitFor(() => expect(hasImage()).toBe(true));
  });
});

describe("the 2000-object limit", () => {
  const FULL = Array.from({ length: 2000 }, (_, index) => ({
    id: `box-${index}`,
    class_id: 7,
    x: (index % 50) / 52,
    y: Math.floor(index / 50) / 42,
    w: 0.01,
    h: 0.01,
  }));

  it("refuses a 2001st box with a gray notification and sends no PUT", async () => {
    stubImageDecoding(300, 200);
    setUpCanvas();
    const { puts } = stubEditorApi({ boxes: FULL, version: 3 });
    render();
    await screen.findByRole("application");
    await waitFor(() => expect(hasImage()).toBe(true));
    await screen.findByText("Objects: 2000");

    act(() => {
      drag([100, 100], [400, 300]);
    });

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "gray",
          message: "An image can have at most 2000 objects.",
        }),
      ),
    );
    await sleep(600);
    expect(puts).toHaveLength(0);
    expect(screen.getByText("Objects: 2000")).toBeInTheDocument();
  }, 30000);
});
