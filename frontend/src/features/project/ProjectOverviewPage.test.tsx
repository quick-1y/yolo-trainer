import { screen } from "@testing-library/react";
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

function stubFetchForProject(project: StubProject) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith(`/api/projects/${project.id}`)) {
        return new Response(JSON.stringify(project), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    }),
  );
}

describe("ProjectOverviewPage", () => {
  it("shows name, task-type badge, description, formatted created date, and the empty-state hint", async () => {
    const project: StubProject = {
      id: 7,
      name: "Cars",
      task_type: "detect",
      description: "Detecting cars in traffic footage.",
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
    };
    stubFetchForProject(project);

    renderWithProviders(<AppRoutes />, { route: "/projects/7" });

    expect(await screen.findByText("Cars")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("projects:taskType.detect"))).toBeInTheDocument();
    expect(screen.getByText("Detecting cars in traffic footage.")).toBeInTheDocument();
    const expectedDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
      new Date(project.created_at),
    );
    expect(screen.getByText(i18n.t("project:overview.createdAt", { date: expectedDate })))
      .toBeInTheDocument();
    expect(screen.getByText(i18n.t("project:overview.emptyHint"))).toBeInTheDocument();
  });

  it("shows the translated no-description hint when description is null", async () => {
    const project: StubProject = {
      id: 8,
      name: "Boats",
      task_type: "segment",
      description: null,
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
    };
    stubFetchForProject(project);

    renderWithProviders(<AppRoutes />, { route: "/projects/8" });

    expect(await screen.findByText(i18n.t("project:overview.noDescription"))).toBeInTheDocument();
  });

  it("shows the back link, Overview, and Settings - but no unbuilt-section links", async () => {
    const project: StubProject = {
      id: 9,
      name: "Planes",
      task_type: "detect",
      description: null,
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
    };
    stubFetchForProject(project);

    renderWithProviders(<AppRoutes />, { route: "/projects/9" });

    expect(await screen.findByText(`← ${i18n.t("project:nav.back")}`)).toBeInTheDocument();
    expect(screen.getByText(i18n.t("project:nav.overview"))).toBeInTheDocument();
    // D-11: Settings (Plan 09) is a real, built section - only Images,
    // Classes, Training, and Models remain unbuilt at this point.
    expect(screen.getByText(i18n.t("project:nav.settings"))).toBeInTheDocument();
    const navLinks = screen.getAllByRole("link").map((link) => link.textContent ?? "");
    expect(navLinks.some((text) => /classes|training|models/i.test(text))).toBe(false);
  });

  it("navigates to /projects/{id} and shows its overview when a project card is clicked", async () => {
    const projects: StubProject[] = [
      {
        id: 10,
        name: "Trains",
        task_type: "detect",
        description: null,
        created_at: "2026-01-15T10:00:00Z",
        updated_at: "2026-01-15T10:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/api/projects/10")) {
          return new Response(JSON.stringify(projects[0]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/api/projects")) {
          return new Response(JSON.stringify(projects), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
      }),
    );

    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects" });

    const card = await screen.findByText("Trains");
    await user.click(card);

    expect(await screen.findByText(i18n.t("project:overview.emptyHint"))).toBeInTheDocument();
  });
});
