import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import type { ProjectClassItem } from "../../api/classes";
import i18n from "../../i18n";
import { renderWithProviders } from "../../test/render";
import { ClassRow } from "./ClassRow";

const ITEM: ProjectClassItem = {
  id: 11,
  name: "car",
  color: "#E6194B",
  index: 0,
  created_at: "2026-01-15T10:00:00Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface PatchCall {
  url: string;
  body: Record<string, unknown>;
}

function stubPatch(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const patches: PatchCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push({ url, body });
      return respond(body);
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return patches;
}

function renderRow(item: ProjectClassItem = ITEM) {
  return renderWithProviders(<ClassRow item={item} projectId={7} />);
}

describe("ClassRow rename", () => {
  it("shows a focused input with the current name selected and leaves edit mode after Enter saves", async () => {
    const patches = stubPatch((body) => json({ ...ITEM, ...body }));
    const { user } = renderRow();

    await user.click(screen.getByRole("button", { name: i18n.t("classes:row.rename") }));
    const input = (await screen.findByRole("textbox")) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.value).toBe("car");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);

    await user.clear(input);
    await user.type(input, "Car{Enter}");

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe("/api/projects/7/classes/11");
    expect(patches[0].body).toEqual({ name: "Car" });
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("Escape restores the name without sending a request", async () => {
    const patches = stubPatch((body) => json({ ...ITEM, ...body }));
    const { user } = renderRow();

    await user.click(screen.getByRole("button", { name: i18n.t("classes:row.rename") }));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "bus{Escape}");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("car")).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it("does not save an empty or unchanged value", async () => {
    const patches = stubPatch((body) => json({ ...ITEM, ...body }));
    const { user } = renderRow();

    await user.click(screen.getByRole("button", { name: i18n.t("classes:row.rename") }));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "   {Enter}");
    expect(patches).toHaveLength(0);
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "car{Enter}");
    expect(patches).toHaveLength(0);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps the input open with the API message after a 409 and re-enables it", async () => {
    const patches = stubPatch(() => json({ detail: 'A class named "plane" already exists.' }, 409));
    const { user } = renderRow();

    await user.click(screen.getByRole("button", { name: i18n.t("classes:row.rename") }));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "PLANE{Enter}");

    expect(await screen.findByText('A class named "plane" already exists.')).toBeInTheDocument();
    expect(patches).toHaveLength(1);
    expect(screen.getByRole("textbox")).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText('A class named "plane" already exists.')).not.toBeInTheDocument();
    expect(screen.getByText("car")).toBeInTheDocument();
  });

  it("disables the input while the PATCH is pending", async () => {
    let release: (response: Response) => void = () => undefined;
    stubPatch(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const { user } = renderRow();

    await user.click(screen.getByRole("button", { name: i18n.t("classes:row.rename") }));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "Car{Enter}");

    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
    release(json({ ...ITEM, name: "Car" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });
});

describe("ClassRow recolor", () => {
  const swatchButton = () =>
    screen.getByRole("button", { name: i18n.t("classes:row.changeColor", { name: "car" }) });

  it("labels the swatch button and sends one PATCH {color} for a palette preset, updating the swatch immediately", async () => {
    let release: (response: Response) => void = () => undefined;
    const patches = stubPatch(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const { user } = renderRow();

    await user.click(swatchButton());
    await user.click(await screen.findByRole("button", { name: "#4363D8" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe("/api/projects/7/classes/11");
    expect(patches[0].body).toEqual({ color: "#4363D8" });
    // Optimistic: the swatch already shows the new color while the PATCH is pending.
    expect(swatchButton()).toHaveStyle({ background: "#4363D8" });
    release(json({ ...ITEM, color: "#4363D8" }));
    await waitFor(() => expect(patches).toHaveLength(1));
  });

  it("restores the previous color and shows a red notification when the PATCH fails", async () => {
    const patches = stubPatch(() => json({ detail: "Database is unavailable." }, 500));
    const { user } = renderRow();

    await user.click(swatchButton());
    await user.click(await screen.findByRole("button", { name: "#4363D8" }));

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red", message: "Database is unavailable." }),
      ),
    );
    expect(patches).toHaveLength(1);
    expect(swatchButton()).toHaveStyle({ background: "#E6194B" });
  });

  it("does not send a request when the chosen color equals the current one", async () => {
    const patches = stubPatch((body) => json({ ...ITEM, ...body }));
    renderRow();

    fireEvent.click(swatchButton());
    fireEvent.click(await screen.findByRole("button", { name: "#E6194B" }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(patches).toHaveLength(0);
  });
});
