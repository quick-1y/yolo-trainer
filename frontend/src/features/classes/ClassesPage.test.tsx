import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import i18n from "../../i18n";
import { renderWithProviders } from "../../test/render";

interface StubClass {
  id: number;
  name: string;
  color: string;
  index: number;
  created_at: string;
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

interface StubOptions {
  classes?: StubClass[];
  /** Responder for POST /classes; defaults to appending a class with the next index. */
  onPost?: (body: { name: string }) => Response;
  listFails?: () => boolean;
}

function stubApi(options: StubOptions = {}) {
  const classes: StubClass[] = options.classes ?? [];
  const posts: { name: string }[] = [];
  let listCalls = 0;

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/projects/7")) {
      return json(PROJECT);
    }
    if (url.endsWith("/api/projects/7/classes") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { name: string };
      posts.push(body);
      if (options.onPost) {
        return options.onPost(body);
      }
      const created: StubClass = {
        id: classes.length + 1,
        name: body.name,
        color: "#E6194B",
        index: classes.length,
        created_at: "2026-01-15T10:00:00Z",
      };
      classes.push(created);
      return json(created, 201);
    }
    if (url.endsWith("/api/projects/7/classes")) {
      listCalls += 1;
      if (options.listFails?.()) {
        return json({ detail: "Database is unavailable." }, 500);
      }
      return json(classes);
    }
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { posts, listCalls: () => listCalls };
}

describe("ClassesPage", () => {
  it("shows the add form, the index hint and the empty state for a project without classes", async () => {
    stubApi();
    renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    expect(await screen.findByText(i18n.t("classes:emptyState.title"))).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t("classes:add.label"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("classes:page.indexHint"))).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: i18n.t("classes:add.submit") }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t("classes:page.count", { count: 0 }))).toBeInTheDocument();
  });

  it("creates a class on Enter and shows it with its index and color, then clears the input", async () => {
    const api = stubApi();
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    const input = await screen.findByLabelText(i18n.t("classes:add.label"));
    await user.type(input, "car{Enter}");

    expect(await screen.findByText("car")).toBeInTheDocument();
    expect(api.posts).toEqual([{ name: "car" }]);
    expect(screen.getByTestId("class-index")).toHaveTextContent("0");
    expect(screen.getByTestId("class-swatch")).toHaveStyle({ backgroundColor: "#E6194B" });
    expect(screen.getByLabelText(i18n.t("classes:add.label"))).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText(i18n.t("classes:add.label"))).toHaveFocus());
  });

  it("shows nameRequired for a whitespace-only name and sends no request", async () => {
    const api = stubApi();
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    const input = await screen.findByLabelText(i18n.t("classes:add.label"));
    await user.type(input, "   {Enter}");

    expect(await screen.findByText(i18n.t("classes:validation.nameRequired"))).toBeInTheDocument();
    expect(api.posts).toHaveLength(0);
  });

  it("shows nameTooLong for more than 100 code points and sends no request", async () => {
    const api = stubApi();
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    const input = await screen.findByLabelText(i18n.t("classes:add.label"));
    // maxLength is only enforced for typed input; a paste/programmatic value can exceed it.
    fireEvent.change(input, { target: { value: "x".repeat(101) } });
    await user.click(screen.getByRole("button", { name: i18n.t("classes:add.submit") }));

    expect(await screen.findByText(i18n.t("classes:validation.nameTooLong"))).toBeInTheDocument();
    expect(api.posts).toHaveLength(0);
  });

  it("limits the input to 100 characters", async () => {
    stubApi();
    renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    const input = await screen.findByLabelText(i18n.t("classes:add.label"));
    expect(input).toHaveAttribute("maxlength", "100");
  });

  it("shows the API message under the input on a 409 and keeps the typed value", async () => {
    stubApi({
      onPost: () => json({ detail: 'A class named "car" already exists.' }, 409),
    });
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    const input = await screen.findByLabelText(i18n.t("classes:add.label"));
    await user.type(input, "Car{Enter}");

    expect(await screen.findByText('A class named "car" already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t("classes:add.label"))).toHaveValue("Car");
  });

  it("shows the API message with a Try again button when the list fails to load, and refetches", async () => {
    let failing = true;
    const api = stubApi({ listFails: () => failing });
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    expect(await screen.findByText("Database is unavailable.")).toBeInTheDocument();
    // The add form stays visible.
    expect(screen.getByLabelText(i18n.t("classes:add.label"))).toBeInTheDocument();

    const callsBefore = api.listCalls();
    failing = false;
    await user.click(screen.getByRole("button", { name: i18n.t("common:retry") }));

    expect(await screen.findByText(i18n.t("classes:emptyState.title"))).toBeInTheDocument();
    expect(api.listCalls()).toBeGreaterThan(callsBefore);
  });

  it("lists existing classes in index order with a tooltip title holding the full name", async () => {
    stubApi({
      classes: [
        { id: 1, name: "car", color: "#E6194B", index: 0, created_at: "2026-01-15T10:00:00Z" },
        { id: 2, name: "plane", color: "#3CB44B", index: 1, created_at: "2026-01-15T10:00:00Z" },
      ],
    });
    renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    expect(await screen.findByText("plane")).toBeInTheDocument();
    expect(screen.getByText("car")).toHaveAttribute("title", "car");
    expect(screen.getAllByTestId("class-index").map((el) => el.textContent)).toEqual(["0", "1"]);
    expect(screen.getByText(i18n.t("classes:page.count", { count: 2 }))).toBeInTheDocument();
  });

  it("lists Overview, Images, Classes, Settings in order with only Classes active", async () => {
    stubApi();
    renderWithProviders(<AppRoutes />, { route: "/projects/7/classes" });

    await screen.findByText(i18n.t("classes:emptyState.title"));
    const labels = [
      i18n.t("project:nav.overview"),
      i18n.t("project:nav.images"),
      i18n.t("project:nav.classes"),
      i18n.t("project:nav.settings"),
    ];
    const links = screen
      .getAllByRole("link")
      .filter((link) => labels.includes(link.textContent ?? ""));
    expect(links.map((link) => link.textContent)).toEqual(labels);
    const active = links.filter((link) => link.getAttribute("data-active") === "true");
    expect(active.map((link) => link.textContent)).toEqual([i18n.t("project:nav.classes")]);
  });
});
