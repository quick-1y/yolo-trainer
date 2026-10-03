import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import { useProjects } from "../../api/projects";
import { renderWithProviders } from "../../test/render";
import { CreateProjectModal } from "./CreateProjectModal";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CREATED_PROJECT = {
  id: 1,
  name: "Cars",
  task_type: "detect",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** Mounts the modal alongside an active `useProjects` observer, so a
 * successful create's `invalidateQueries` triggers a real, observable
 * refetch (react-query only refetches queries with active subscribers). */
function ModalWithActiveProjectsQuery({ onClose }: { onClose: () => void }) {
  useProjects();
  return <CreateProjectModal opened onClose={onClose} />;
}

describe("CreateProjectModal", () => {
  it.each(["", "   "])(
    "blocks submission with a translated message for an empty/whitespace name (%j)",
    async (name) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const { user } = renderWithProviders(<CreateProjectModal opened onClose={vi.fn()} />);
      const nameInput = screen.getByLabelText(i18n.t("projects:modal.nameLabel"));
      if (name !== "") {
        await user.type(nameInput, name);
      }
      await user.click(screen.getByRole("button", { name: i18n.t("projects:modal.submit") }));

      expect(
        await screen.findByText(i18n.t("projects:create.validation.nameRequired")),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("blocks submission with a translated message for a name over 100 characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<CreateProjectModal opened onClose={vi.fn()} />);
    await user.click(screen.getByLabelText(i18n.t("projects:modal.nameLabel")));
    await user.paste("a".repeat(101));
    await user.click(screen.getByRole("button", { name: i18n.t("projects:modal.submit") }));

    expect(
      await screen.findByText(i18n.t("projects:create.validation.nameTooLong")),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the translated error title and the API's own detail verbatim on a 409", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'A project named "Cars" already exists.' }, 409),
      );
    vi.stubGlobal("fetch", fetchMock);

    const handleClose = vi.fn();
    const { user } = renderWithProviders(<CreateProjectModal opened onClose={handleClose} />);
    await user.type(screen.getByLabelText(i18n.t("projects:modal.nameLabel")), "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("projects:modal.submit") }));

    expect(
      await screen.findByText('A project named "Cars" already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t("common:error.title"))).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("on 201: closes, resets fields, and invalidates the projects query (a GET refetch happens)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([])) // initial useProjects load
      .mockResolvedValueOnce(jsonResponse(CREATED_PROJECT, 201)) // POST create
      .mockResolvedValueOnce(jsonResponse([CREATED_PROJECT])); // invalidated refetch
    vi.stubGlobal("fetch", fetchMock);

    const handleClose = vi.fn();
    const { user } = renderWithProviders(<ModalWithActiveProjectsQuery onClose={handleClose} />);

    // Let the initial useProjects() fetch resolve before submitting, so calls
    // land in a deterministic order (GET, POST, GET-refetch).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText(i18n.t("projects:modal.nameLabel")), "Cars");
    await user.click(screen.getByRole("button", { name: i18n.t("projects:modal.submit") }));

    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    const postBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(postBody).toEqual({ name: "Cars", task_type: "detect", description: null });

    expect(screen.getByLabelText(i18n.t("projects:modal.nameLabel"))).toHaveValue("");
  });

  it("shows a loading state and ignores repeat clicks while the request is pending", async () => {
    let resolvePost: (response: Response) => void = () => {
      throw new Error("resolvePost called before assigned");
    };
    const pendingPost = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingPost);
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<CreateProjectModal opened onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(i18n.t("projects:modal.nameLabel")), "Cars");

    const submitButton = screen.getByRole("button", { name: i18n.t("projects:modal.submit") });
    await user.click(submitButton);
    await user.click(submitButton);
    await user.click(submitButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(submitButton).toBeDisabled());

    resolvePost(jsonResponse(CREATED_PROJECT, 201));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("defaults task type to detect and sends 'segment' after switching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ...CREATED_PROJECT, id: 2, name: "Boats", task_type: "segment" }, 201),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithProviders(<CreateProjectModal opened onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(i18n.t("projects:modal.nameLabel")), "Boats");
    await user.click(screen.getByRole("radio", { name: i18n.t("projects:taskType.segment") }));
    await user.click(screen.getByRole("button", { name: i18n.t("projects:modal.submit") }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.task_type).toBe("segment");
  });
});
