import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import { renderWithProviders } from "../../test/render";
import { ProjectsPage } from "./ProjectsPage";

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

describe("ProjectsPage", () => {
  it("shows only the new-project card and empty-state hint when there are no projects", async () => {
    mockFetchOnce([]);
    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText(i18n.t("projects:emptyState.hint"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("projects:newProjectCard.label"))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t("projects:taskType.detect"))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("projects:taskType.segment"))).not.toBeInTheDocument();
  });

  it("renders project cards in API order with name, task-type badge, and relative time", async () => {
    const now = new Date().toISOString();
    const projects = [
      {
        id: 1,
        name: "Cars",
        task_type: "detect",
        description: null,
        created_at: now,
        updated_at: now,
        image_count: 3,
        class_count: 0,
      },
      {
        id: 2,
        name: "Boats",
        task_type: "segment",
        description: null,
        created_at: now,
        updated_at: now,
        image_count: 3,
        class_count: 0,
      },
    ];
    mockFetchOnce(projects);
    renderWithProviders(<ProjectsPage />);

    const names = await screen.findAllByText(/^(Cars|Boats)$/);
    expect(names.map((el) => el.textContent)).toEqual(["Cars", "Boats"]);
    expect(screen.getByText(i18n.t("projects:taskType.detect"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("projects:taskType.segment"))).toBeInTheDocument();
    expect(screen.getAllByText("now")).toHaveLength(2);
    expect(screen.getAllByText(i18n.t("projects:card.images", { count: 3 }))).toHaveLength(2);
  });

  it("shows a translated error title and the API's own detail text on a 500", async () => {
    mockFetchOnce({ detail: "Boom." }, 500);
    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(screen.getByText("Boom.")).toBeInTheDocument();
  });
});
