import { act, screen, waitFor } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { type NextUnannotatedMode, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { resetEditorUi } from "./store/editorUiStore";
import { resetEditors } from "./store/storeRegistry";

const ROUTE = "/projects/1/annotate/5?sort=name&q=img";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

const currentLocation = () => screen.getByTestId("location").textContent ?? "";

async function openEditor(nextUnannotated: NextUnannotatedMode) {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi({ nextUnannotated });
  const rendered = renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route: ROUTE },
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

const nextUnannotatedButton = () => screen.getByRole("button", { name: /Next unannotated/ });

/** The request paths in the order the stub saw them. */
function requestOrder(fetchMock: ReturnType<typeof stubEditorApi>["fetchMock"]): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    return `${init?.method ?? "GET"} ${url.pathname}`;
  });
}

afterEach(() => {
  resetEditors();
  resetEditorUi();
  vi.mocked(notifications.show).mockClear();
});

describe("next unannotated", () => {
  it("saves first, asks the server with the grid's sort, search and the current image, then navigates", async () => {
    const { fetchMock, nextUnannotatedRequests } = await openEditor({ image_id: 9 });

    drag([100, 100], [400, 300]);
    press({ code: "KeyN", key: "n" });

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/9?sort=name&q=img"));
    expect(nextUnannotatedRequests).toHaveLength(1);
    expect(nextUnannotatedRequests[0].get("sort")).toBe("name");
    expect(nextUnannotatedRequests[0].get("q")).toBe("img");
    expect(nextUnannotatedRequests[0].get("after")).toBe("5");

    const order = requestOrder(fetchMock);
    const put = order.indexOf("PUT /api/projects/1/images/5/annotations");
    const lookup = order.indexOf("GET /api/projects/1/images/next-unannotated");
    expect(put).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(put);
  });

  it("the button does the same as the key", async () => {
    const { user, nextUnannotatedRequests } = await openEditor({ image_id: 9 });

    await user.click(nextUnannotatedButton());

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/9?sort=name&q=img"));
    expect(nextUnannotatedRequests).toHaveLength(1);
  });

  it("tells the user there is no other unannotated image and stays", async () => {
    await openEditor({ image_id: null });

    press({ code: "KeyN", key: "n" });

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "gray",
          message: "No other unannotated images.",
          autoClose: 4000,
        }),
      ),
    );
    expect(currentLocation()).toBe(ROUTE);
  });

  it("shows a red notification with the API message when the lookup fails and stays", async () => {
    await openEditor({ error: "Boom." });

    press({ code: "KeyN", key: "n" });

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red", message: "Boom." }),
      ),
    );
    expect(currentLocation()).toBe(ROUTE);
  });

  it("shows the loading state while the lookup runs and ignores a second N", async () => {
    const { nextUnannotatedRequests, releaseNextUnannotated } = await openEditor({
      image_id: 9,
      hold: true,
    });

    press({ code: "KeyN", key: "n" });

    await waitFor(() => expect(nextUnannotatedRequests).toHaveLength(1));
    await waitFor(() => expect(nextUnannotatedButton()).toHaveAttribute("data-loading", "true"));
    press({ code: "KeyN", key: "n" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(nextUnannotatedRequests).toHaveLength(1);

    releaseNextUnannotated();
    await waitFor(() => expect(currentLocation()).toBe("/projects/1/annotate/9?sort=name&q=img"));
    expect(nextUnannotatedRequests).toHaveLength(1);
  });
});
