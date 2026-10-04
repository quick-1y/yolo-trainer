import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import { AppRoutes } from "../../app/routes";
import i18n from "../../i18n";
import { renderWithProviders } from "../../test/render";

interface StubClass {
  id: number;
  name: string;
  color: string;
  index: number;
  created_at: string;
  object_count: number;
}

const PROJECT = {
  id: 7,
  name: "Vehicles",
  task_type: "detect",
  description: null,
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClasses(): StubClass[] {
  return ["car", "plane", "boat"].map((name, index) => ({
    id: index + 1,
    name,
    color: "#E6194B",
    index,
    created_at: "2026-01-15T10:00:00Z",
    // Only "car" owns boxes; the other classes have none.
    object_count: index === 0 ? 3 : 0,
  }));
}

type DeleteResponder = (classId: number) => Response;

/** Stub API where a successful DELETE removes the class and shifts later indices. */
function stubApi(onDelete?: DeleteResponder) {
  const classes = makeClasses();
  const deletes: string[] = [];

  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/projects/7")) {
        return json(PROJECT);
      }
      const match = /\/api\/projects\/7\/classes\/(\d+)$/.exec(url);
      if (match && method === "DELETE") {
        deletes.push(url);
        const classId = Number(match[1]);
        if (onDelete) {
          const response = onDelete(classId);
          if (response.status >= 400 && response.status !== 404) {
            return response;
          }
        }
        const at = classes.findIndex((item) => item.id === classId);
        if (at >= 0) {
          classes.splice(at, 1);
          classes.forEach((item, index) => {
            item.index = index;
          });
          return new Response(null, { status: 204 });
        }
        return json({ detail: "Class not found." }, 404);
      }
      if (url.endsWith("/api/projects/7/classes")) {
        return json(classes);
      }
      return json({ detail: "Not found" }, 404);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { deletes, classes };
}

async function renderPage(language = "en") {
  const rendered = renderWithProviders(<AppRoutes />, {
    route: "/projects/7/classes",
    language,
  });
  await screen.findByText("boat");
  return rendered;
}

function rowOf(name: string): HTMLElement {
  const row = screen
    .getAllByTestId("class-row")
    .find((candidate) => within(candidate).queryByText(name));
  if (!row) {
    throw new Error(`no row for ${name}`);
  }
  return row;
}

async function openDeleteDialog(
  user: Awaited<ReturnType<typeof renderPage>>["user"],
  name: string,
) {
  await user.click(
    within(rowOf(name)).getByRole("button", {
      name: i18n.t("classes:row.delete"),
    }),
  );
  return screen.findByRole("dialog");
}

const confirmName = () => ({ name: i18n.t("classes:delete.confirm") });

describe("DeleteClassModal", () => {
  it("opens from the row Delete button and sends no request until the confirm button is pressed", async () => {
    const { deletes } = stubApi();
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "plane");

    expect(
      within(dialog).getByRole("heading", {
        name: i18n.t("classes:delete.title"),
      }),
    ).toBeInTheDocument();
    expect(deletes).toHaveLength(0);

    // Neither Enter on the row nor Delete/Backspace key paths delete anything.
    await user.keyboard("{Delete}{Backspace}");
    expect(deletes).toHaveLength(0);
    expect(
      within(dialog).getByRole("button", confirmName()),
    ).toBeInTheDocument();
  });

  it("starts with focus on Cancel and closes with Cancel without a DELETE", async () => {
    const { deletes } = stubApi();
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "plane");
    const cancel = within(dialog).getByRole("button", {
      name: i18n.t("projects:modal.cancel"),
    });
    await waitFor(() => expect(cancel).toHaveFocus());

    await user.click(cancel);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(deletes).toHaveLength(0);
    expect(screen.getByText("plane")).toBeInTheDocument();
  });

  it("Escape closes the dialog without a DELETE", async () => {
    const { deletes } = stubApi();
    const { user } = await renderPage();

    await openDeleteDialog(user, "plane");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(deletes).toHaveLength(0);
  });

  it("confirming sends exactly one DELETE, closes, notifies in green and re-renders the shifted indices", async () => {
    const { deletes } = stubApi();
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "car");
    await user.click(within(dialog).getByRole("button", confirmName()));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(deletes).toEqual(["/api/projects/7/classes/1"]);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "green",
        message: i18n.t("classes:delete.done", { name: "car" }),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("car")).not.toBeInTheDocument(),
    );
    const rows = screen.getAllByTestId("class-row");
    expect(
      rows.map((row) => within(row).getByTestId("class-index").textContent),
    ).toEqual(["0", "1"]);
    expect(rows.map((row) => within(row).getByTitle(/./).textContent)).toEqual([
      "plane",
      "boat",
    ]);
  });

  it("shows the index-shift sentence for a class with later classes and omits it for the last class", async () => {
    stubApi();
    const { user } = await renderPage();
    const shift = i18n.t("classes:delete.shiftNote");

    const middle = await openDeleteDialog(user, "plane");
    expect(
      within(middle).getByText(new RegExp(shift.replace(/[.]/g, "\\."))),
    ).toBeInTheDocument();
    await user.click(
      within(middle).getByRole("button", {
        name: i18n.t("projects:modal.cancel"),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    const last = await openDeleteDialog(user, "boat");
    expect(within(last).getByText(/boat/)).toBeInTheDocument();
    expect(
      within(last).queryByText(new RegExp(shift.replace(/[.]/g, "\\."))),
    ).not.toBeInTheDocument();
  });

  it("adds a bold paragraph with the number of objects that go with a class that has boxes", async () => {
    stubApi();
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "car");

    const objects = within(dialog).getByText(
      "Objects that will be deleted with it: 3.",
    );
    expect(objects).toHaveStyle({ fontWeight: "600" });
    // The existing sentences are still there, in their own paragraph.
    expect(
      within(dialog).getByText(i18n.t("classes:delete.body", { name: "car" }), {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(objects).not.toBe(
      within(dialog).getByText(i18n.t("classes:delete.body", { name: "car" }), {
        exact: false,
      }),
    );
  });

  it("shows no objects paragraph for a class without boxes", async () => {
    stubApi();
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "plane");

    expect(
      within(dialog).queryByText(/Objects that will be deleted/),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", confirmName())).toBeInTheDocument();
  });

  it("shows the objects paragraph in Russian", async () => {
    stubApi();
    const { user } = await renderPage("ru");

    const dialog = await openDeleteDialog(user, "car");

    expect(
      within(dialog).getByText("Вместе с ним будут удалены объекты: 3."),
    ).toBeInTheDocument();
  });

  it("treats a 404 from DELETE as already deleted: closes, notifies and refreshes the list", async () => {
    // The class is gone on the server before the confirm click.
    const { classes } = stubApi();
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "plane");
    classes.splice(1, 1);
    classes.forEach((item, index) => {
      item.index = index;
    });
    await user.click(within(dialog).getByRole("button", confirmName()));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "green" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("plane")).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open and shows the API message in a red Alert after a 500", async () => {
    stubApi(() => json({ detail: "Database is unavailable." }, 500));
    const { user } = await renderPage();

    const dialog = await openDeleteDialog(user, "plane");
    await user.click(within(dialog).getByRole("button", confirmName()));

    expect(
      await within(dialog).findByText("Database is unavailable."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(i18n.t("common:error.title")),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("plane")).toBeInTheDocument();
    expect(notifications.show).not.toHaveBeenCalled();
  });
});
