import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import i18n from "../../i18n";
import { renderWithProviders } from "../../test/render";

interface StubProject {
  id: number;
  name: string;
  task_type: "detect" | "segment";
  description: string | null;
  created_at: string;
  updated_at: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE_PROJECT: StubProject = {
  id: 7,
  name: "Cars",
  task_type: "detect",
  description: "Detecting cars in traffic footage.",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function findPatchCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");
}

describe("ProjectSettingsPage", () => {
  it("prefills name and description, and disables Save until a value changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(BASE_PROJECT));
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });

    const nameInput = await screen.findByLabelText(i18n.t("project:settings.name"));
    expect(nameInput).toHaveValue("Cars");
    expect(screen.getByLabelText(i18n.t("project:settings.description"))).toHaveValue(
      "Detecting cars in traffic footage.",
    );
    expect(screen.getByRole("button", { name: i18n.t("project:settings.save") })).toBeDisabled();
  });

  it("sends PATCH with only the changed field and reflects the new name in the page title", async () => {
    const updated: StubProject = { ...BASE_PROJECT, name: "Trucks" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(BASE_PROJECT)) // initial GET detail
      .mockResolvedValueOnce(jsonResponse(updated)) // PATCH
      // Both `projectKeys.all` and `projectKeys.detail(id)` are invalidated on
      // success, which can trigger more than one refetch of the (now-stale)
      // active detail query - a fresh Response per call (a `Response` body can
      // only be read once) so any of them resolves to the updated row.
      .mockImplementation(async () => jsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });

    const nameInput = await screen.findByLabelText(i18n.t("project:settings.name"));
    await user.clear(nameInput);
    await user.type(nameInput, "Trucks");
    await user.click(screen.getByRole("button", { name: i18n.t("project:settings.save") }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Trucks" })).toBeInTheDocument();
    });

    const patchCall = findPatchCall(fetchMock);
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({ name: "Trucks" });
  });

  it("shows the translated error title and the API detail verbatim on 409, keeping the user's input", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(BASE_PROJECT))
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'A project named "Trucks" already exists.' }, 409),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });

    const nameInput = await screen.findByLabelText(i18n.t("project:settings.name"));
    await user.clear(nameInput);
    await user.type(nameInput, "Trucks");
    await user.click(screen.getByRole("button", { name: i18n.t("project:settings.save") }));

    expect(
      await screen.findByText('A project named "Trucks" already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(nameInput).toHaveValue("Trucks");
  });

  it("blocks submission with a translated message when the name is cleared", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(BASE_PROJECT));
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });

    const nameInput = await screen.findByLabelText(i18n.t("project:settings.name"));
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: i18n.t("project:settings.save") }));

    expect(
      await screen.findByText(i18n.t("project:settings.validation.nameRequired")),
    ).toBeInTheDocument();
    expect(findPatchCall(fetchMock)).toBeUndefined();
  });

  it("shows the task type as read-only text, renders no task-type input, and never sends task_type in the PATCH body", async () => {
    const updated: StubProject = { ...BASE_PROJECT, description: "Updated notes." };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(BASE_PROJECT))
      .mockResolvedValueOnce(jsonResponse(updated))
      .mockImplementation(async () => jsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });

    expect(await screen.findByText(i18n.t("projects:taskType.detect"))).toBeInTheDocument();
    // The only radiogroup on the page is the header's language switcher - no
    // task-type SegmentedControl/select/radio input exists anywhere here.
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(
      screen.queryByRole("textbox", { name: i18n.t("project:settings.taskType") }),
    ).not.toBeInTheDocument();

    const descriptionInput = screen.getByLabelText(i18n.t("project:settings.description"));
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Updated notes.");
    await user.click(screen.getByRole("button", { name: i18n.t("project:settings.save") }));

    await waitFor(() => expect(findPatchCall(fetchMock)).toBeDefined());
    const patchCall = findPatchCall(fetchMock);
    const body = JSON.parse((patchCall?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("task_type");
  });
});
