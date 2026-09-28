import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../app/routes";
import i18n from "../i18n";
import { renderWithProviders } from "../test/render";

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("Not-found states", () => {
  it("shows the translated project-not-found state with a link back to /projects on a 404", async () => {
    mockFetchOnce({ detail: "Project not found." }, 404);

    renderWithProviders(<AppRoutes />, { route: "/projects/999" });

    expect(await screen.findByText(i18n.t("project:notFound.title"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("project:notFound.body"))).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: i18n.t("project:notFound.back") });
    expect(backLink).toHaveAttribute("href", "/projects");
  });

  it("shows the not-found state for a non-numeric project id without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AppRoutes />, { route: "/projects/abc" });

    expect(await screen.findByText(i18n.t("project:notFound.title"))).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the generic not-found page with a link to /projects for an unknown route", async () => {
    renderWithProviders(<AppRoutes />, { route: "/does-not-exist" });

    expect(await screen.findByText(i18n.t("project:pageNotFound.title"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("project:pageNotFound.body"))).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: i18n.t("project:notFound.back") });
    expect(backLink).toHaveAttribute("href", "/projects");
  });

  it("shows the translated error title and API detail (not the not-found state) on a 500", async () => {
    mockFetchOnce({ detail: "Boom." }, 500);

    renderWithProviders(<AppRoutes />, { route: "/projects/5" });

    expect(await screen.findByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(screen.getByText("Boom.")).toBeInTheDocument();
    expect(screen.queryByText(i18n.t("project:notFound.title"))).not.toBeInTheDocument();
  });
});
