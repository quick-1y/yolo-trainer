import { screen, waitFor, within } from "@testing-library/react";
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
  image_count: number;
  class_count: number;
  run_count: number;
  model_count: number;
  active_run_count: number;
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
  image_count: 0,
  class_count: 0,
  run_count: 0,
  model_count: 0,
  active_run_count: 0,
};

interface Server {
  fetchMock: ReturnType<typeof vi.fn>;
  /** What GET /api/projects/7 answers from now on. */
  setProject: (project: StubProject) => void;
  /** Number of calls made to `method path`. */
  calls: (method: string, path: string) => number;
}

interface ServerOptions {
  project?: StubProject;
  deleteStatus?: number;
  deleteBody?: unknown;
  /** How long the DELETE takes to answer. */
  deleteDelayMs?: number;
}

/**
 * A `fetch` stub routed by method and URL, so the order of requests (and any request a
 * later phase adds to every page) cannot shift the answers.
 */
function createServer({
  project = BASE_PROJECT,
  deleteStatus = 204,
  deleteBody = null,
  deleteDelayMs = 0,
}: ServerOptions = {}): Server {
  let current = project;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = String(input);
    if (method === "GET" && path === "/api/projects/7") {
      return jsonResponse(current);
    }
    if (method === "GET" && path === "/api/projects") {
      return jsonResponse([]);
    }
    if (method === "DELETE" && path === "/api/projects/7") {
      if (deleteDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, deleteDelayMs));
      }
      return jsonResponse(deleteBody, deleteStatus);
    }
    return jsonResponse({ detail: "Not found." }, 404);
  });
  return {
    fetchMock,
    setProject: (next) => {
      current = next;
    },
    calls: (method, path) =>
      fetchMock.mock.calls.filter(
        (call) =>
          ((call[1] as RequestInit | undefined)?.method ?? "GET") === method &&
          String(call[0]) === path,
      ).length,
  };
}

async function renderSettings(server: Server): Promise<{ user: UserEvent }> {
  vi.stubGlobal("fetch", server.fetchMock);
  const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/settings" });
  await screen.findByRole("button", { name: i18n.t("project:delete.button") });
  return { user };
}

async function openDialog(user: UserEvent): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: i18n.t("project:delete.button") }));
  return screen.findByRole("dialog");
}

async function renderSettingsAndOpenModal(
  server: Server,
): Promise<{ user: UserEvent; confirmInput: HTMLElement }> {
  const { user } = await renderSettings(server);
  await openDialog(user);
  const confirmInput = await screen.findByLabelText(
    i18n.t("project:delete.typeToConfirm", { name: BASE_PROJECT.name }),
  );
  return { user, confirmInput };
}

describe("DeleteProjectModal", () => {
  it("disables the confirm button until the exact, case-sensitive project name is typed", async () => {
    const server = createServer();
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

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
    const server = createServer();
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

    await user.type(confirmInput, "cars{Enter}");

    expect(server.calls("DELETE", "/api/projects/7")).toBe(0);
  });

  it("confirming sends exactly one DELETE, navigates to /projects, and shows a translated notification", async () => {
    const server = createServer();
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    expect(
      await screen.findByRole("heading", { name: i18n.t("projects:page.title") }),
    ).toBeInTheDocument();
    expect(server.calls("DELETE", "/api/projects/7")).toBe(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: i18n.t("project:delete.done", { name: "Cars" }),
      }),
    );
  });

  it("pressing Enter twice while the delete is pending still sends one DELETE", async () => {
    const server = createServer({ deleteDelayMs: 60 });
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

    await user.type(confirmInput, "Cars{Enter}{Enter}");

    expect(
      await screen.findByRole("heading", { name: i18n.t("projects:page.title") }),
    ).toBeInTheDocument();
    expect(server.calls("DELETE", "/api/projects/7")).toBe(1);
  });

  it("a 404 from DELETE (already deleted elsewhere) also navigates to /projects", async () => {
    const server = createServer({
      deleteStatus: 404,
      deleteBody: { detail: "Project not found." },
    });
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    expect(
      await screen.findByRole("heading", { name: i18n.t("projects:page.title") }),
    ).toBeInTheDocument();
    await waitFor(() => expect(server.calls("DELETE", "/api/projects/7")).toBe(1));
  });

  it("a 500 from DELETE keeps the modal open and shows the translated error title plus the API detail", async () => {
    const server = createServer({
      deleteStatus: 500,
      deleteBody: { detail: "Internal error." },
    });
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    expect(await screen.findByText("Internal error.")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n.t("project:delete.typeToConfirm", { name: "Cars" })),
    ).toBeInTheDocument();
  });

  it("a 409 from DELETE (a run was queued after the dialog opened) shows the API message and keeps the dialog open", async () => {
    const blocked =
      "A training run is active or queued for this project. Wait for it to finish or remove it from the queue.";
    const server = createServer({ deleteStatus: 409, deleteBody: { detail: blocked } });
    const { user, confirmInput } = await renderSettingsAndOpenModal(server);

    await user.type(confirmInput, "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("project:delete.confirm") }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText(blocked)).toBeInTheDocument();
    expect(within(dialog).getByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText(i18n.t("project:delete.typeToConfirm", { name: "Cars" })),
    ).toBeInTheDocument();
    expect(server.calls("DELETE", "/api/projects/7")).toBe(1);
  });

  it("names the runs and models that go with the project, in bold, after the warning", async () => {
    const server = createServer({
      project: { ...BASE_PROJECT, run_count: 3, model_count: 2 },
    });
    const { user } = await renderSettings(server);

    const dialog = await openDialog(user);

    const runs = within(dialog).getByText("Training runs that will be deleted with it: 3.");
    const models = within(dialog).getByText("Models that will be deleted with it: 2.");
    expect(runs).toHaveStyle({ fontWeight: "600" });
    expect(models).toHaveStyle({ fontWeight: "600" });
    const warning = within(dialog).getByText(
      i18n.t("project:delete.warning", { name: "Cars" }),
    );
    expect(
      warning.compareDocumentPosition(runs) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      runs.compareDocumentPosition(models) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows neither sentence when the project has no runs and no models", async () => {
    const server = createServer();
    const { user } = await renderSettings(server);

    const dialog = await openDialog(user);

    expect(within(dialog).queryByText(/Training runs that will be deleted/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Models that will be deleted/)).not.toBeInTheDocument();
  });

  it("shows only the sentence whose count is above zero", async () => {
    const server = createServer({ project: { ...BASE_PROJECT, run_count: 1 } });
    const { user } = await renderSettings(server);

    const dialog = await openDialog(user);

    expect(
      within(dialog).getByText("Training runs that will be deleted with it: 1."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Models that will be deleted/)).not.toBeInTheDocument();
  });

  it("blocks the delete while a run is active or queued: yellow alert, no name input, disabled confirm, working Cancel", async () => {
    const server = createServer({
      project: { ...BASE_PROJECT, run_count: 1, active_run_count: 1 },
    });
    const { user } = await renderSettings(server);

    const dialog = await openDialog(user);

    const blocked = within(dialog).getByText(i18n.t("project:delete.blocked"));
    expect(blocked.closest('[role="alert"]')?.getAttribute("style")).toContain("yellow");
    expect(
      within(dialog).queryByLabelText(
        i18n.t("project:delete.typeToConfirm", { name: "Cars" }),
      ),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: i18n.t("project:delete.confirm") }),
    ).toBeDisabled();
    const cancel = within(dialog).getByRole("button", { name: i18n.t("projects:modal.cancel") });
    expect(cancel).toBeEnabled();

    await user.click(cancel);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls("DELETE", "/api/projects/7")).toBe(0);
  });

  it("does not show the blocked alert for a project with only finished runs", async () => {
    const server = createServer({ project: { ...BASE_PROJECT, run_count: 2, model_count: 1 } });
    const { user } = await renderSettings(server);

    const dialog = await openDialog(user);

    expect(
      within(dialog).queryByText(i18n.t("project:delete.blocked")),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByLabelText(i18n.t("project:delete.typeToConfirm", { name: "Cars" })),
    ).toBeInTheDocument();
  });

  it("requests the project detail again when the dialog opens so the counts are current", async () => {
    const server = createServer();
    const { user } = await renderSettings(server);
    expect(server.calls("GET", "/api/projects/7")).toBe(1);

    // A run was queued (in another tab, say) after the page loaded.
    server.setProject({ ...BASE_PROJECT, run_count: 1, active_run_count: 1 });
    const dialog = await openDialog(user);

    expect(await within(dialog).findByText(i18n.t("project:delete.blocked"))).toBeInTheDocument();
    expect(server.calls("GET", "/api/projects/7")).toBe(2);
  });
});
