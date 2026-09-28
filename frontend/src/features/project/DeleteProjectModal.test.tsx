import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

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
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

const BASE_PROJECT: StubProject = {
  id: 7,
  name: "Cars",
  task_type: "detect",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function findDeleteCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
  );
}

async function renderSettingsAndOpenModal(
  fetchMock: ReturnType<typeof vi.fn>,
): Promise<{ user: UserEvent; confirmInput: HTMLElement }> {
  vi.stubGlobal("fetch", fetchMock);
  const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });

  await user.click(
    await screen.findByRole("button", { name: i18n.t("project:delete.button") }),
  );
  const confirmInput = await screen.findByLabelText(
    i18n.t("project:delete.typeToConfirm", { name: BASE_PROJECT.name }),
  );
  return { user, confirmInput };
}

describe("DeleteProjectModal", () => {
  it("disables the confirm button until the exact, case-sensitive project name is typed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(BASE_PROJECT));
    const { user, confirmInput } = await renderSettingsAndOpenModal(fetchMock);

    const confirmButton = screen.getByRole("button", {
      name: i18n.t("project:delete.confirm"),
    });
    expect(confirmButton).toBeDisabled();

    await user.type(confirmInput, "cars");
    expect(confirmButton).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, "Car");
    expect(confirmButton).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, "Cars");
    expect(confirmButton).toBeEnabled();
  });

  it("pressing Enter with a non-matching name sends no request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(BASE_PROJECT));
    const { user, confirmInput } = await renderSettingsAndOpenModal(fetchMock);

    await user.type(confirmInput, "cars{Enter}");

    expect(findDeleteCalls(fetchMock)).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial GET detail
  });

  it("confirming sends exactly one DELETE, navigates to /projects, and shows a translated notification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(BASE_PROJECT)) // initial GET detail
      .mockResolvedValueOnce(jsonResponse(null, 204)) // DELETE
      .mockResolvedValueOnce(jsonResponse([])); // GET /api/projects after navigating away
    const { user, confirmInput } = await renderSettingsAndOpenModal(fetchMock);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    expect(
      await screen.findByRole("heading", { name: i18n.t("projects:page.title") }),
    ).toBeInTheDocument();
    expect(findDeleteCalls(fetchMock)).toHaveLength(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: i18n.t("project:delete.done", { name: "Cars" }),
      }),
    );
  });

  it("a 404 from DELETE (already deleted elsewhere) also navigates to /projects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(BASE_PROJECT))
      .mockResolvedValueOnce(jsonResponse({ detail: "Project not found." }, 404))
      .mockResolvedValueOnce(jsonResponse([]));
    const { user, confirmInput } = await renderSettingsAndOpenModal(fetchMock);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    expect(
      await screen.findByRole("heading", { name: i18n.t("projects:page.title") }),
    ).toBeInTheDocument();
    await waitFor(() => expect(findDeleteCalls(fetchMock)).toHaveLength(1));
  });

  it("a 500 from DELETE keeps the modal open and shows the translated error title plus the API detail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(BASE_PROJECT))
      .mockResolvedValueOnce(jsonResponse({ detail: "Internal error." }, 500));
    const { user, confirmInput } = await renderSettingsAndOpenModal(fetchMock);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    expect(await screen.findByText("Internal error.")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n.t("project:delete.typeToConfirm", { name: "Cars" })),
    ).toBeInTheDocument();
  });
});
