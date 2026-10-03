import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/render";
import type { RejectedEntry, UploadState } from "./UploadContext";
import { UploadPanel } from "./UploadPanel";

function state(overrides: Partial<UploadState>): UploadState {
  return {
    status: "done",
    total: 10,
    processed: 10,
    added: 0,
    duplicates: 0,
    rejected: [],
    hadRequestFailures: false,
    ...overrides,
  };
}

function entries(count: number): RejectedEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `file-${i}.txt`,
    reason: "Not a supported image (JPG, PNG, WEBP, BMP).",
  }));
}

function renderPanel(
  uploadState: UploadState,
  handlers: { onCancel?: () => void; onDismiss?: () => void } = {},
) {
  return renderWithProviders(
    <UploadPanel
      state={uploadState}
      onCancel={handlers.onCancel ?? (() => undefined)}
      onDismiss={handlers.onDismiss ?? (() => undefined)}
    />,
  );
}

describe("UploadPanel running", () => {
  it("shows the title, a determinate progress bar and the counters", () => {
    renderPanel(
      state({ status: "running", processed: 3, total: 10, added: 2, duplicates: 1, rejected: [] }),
    );

    expect(screen.getByText("Uploading: 3 of 10")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
    expect(
      screen.getByText("Added: 2 · Already present: 1 · Rejected: 0"),
    ).toBeInTheDocument();
  });

  it("calls onCancel from the Cancel button", async () => {
    const onCancel = vi.fn();
    const { user } = renderPanel(state({ status: "running", processed: 1 }), { onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders no per-file rows while uploading", () => {
    renderPanel(state({ status: "running", processed: 1, rejected: entries(3) }));
    expect(screen.queryAllByTestId("rejected-row")).toHaveLength(0);
  });
});

describe("UploadPanel finished", () => {
  it("shows 'Upload complete' in a status region with only the nonzero badges", () => {
    renderPanel(state({ added: 7, duplicates: 0, rejected: entries(3) }));

    const region = screen.getByRole("status");
    expect(within(region).getByText("Upload complete")).toBeInTheDocument();
    expect(within(region).getByText("Added: 7")).toBeInTheDocument();
    expect(within(region).getByText("Rejected: 3")).toBeInTheDocument();
    expect(within(region).queryByText(/Already present/)).not.toBeInTheDocument();
  });

  it("calls onDismiss from the dismiss button", async () => {
    const onDismiss = vi.fn();
    const { user } = renderPanel(state({ added: 10 }), { onDismiss });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hides the rejected toggle when nothing was rejected", () => {
    renderPanel(state({ added: 10 }));
    expect(screen.queryByRole("button", { name: /Show rejected files/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy list" })).not.toBeInTheDocument();
  });

  it("reveals filename and reason rows and a Copy list button for 2 rejected files", async () => {
    const { user } = renderPanel(state({ added: 8, rejected: entries(2) }));

    await user.click(screen.getByRole("button", { name: "Show rejected files (2)" }));

    const rows = screen.getAllByTestId("rejected-row");
    expect(rows).toHaveLength(2);
    await waitFor(() => expect(rows[0]).toBeVisible());
    expect(within(rows[0]!).getByText("file-0.txt")).toHaveAttribute("title", "file-0.txt");
    expect(
      within(rows[0]!).getByText("Not a supported image (JPG, PNG, WEBP, BMP)."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy list" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide rejected files" })).toBeInTheDocument();
    expect(screen.queryByText(/…and/)).not.toBeInTheDocument();
  });

  it("caps 150 rejected entries at 100 rows plus '…and 50 more' but copies all 150", async () => {
    const { user } = renderPanel(state({ total: 150, processed: 150, rejected: entries(150) }));

    await user.click(screen.getByRole("button", { name: "Show rejected files (150)" }));

    expect(screen.getAllByTestId("rejected-row")).toHaveLength(100);
    expect(screen.getByText("…and 50 more")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy list" }));
    const copied = await navigator.clipboard.readText();
    const lines = copied.split("\n");
    expect(lines).toHaveLength(150);
    expect(lines[0]).toBe("file-0.txt — Not a supported image (JPG, PNG, WEBP, BMP).");
    expect(lines[149]).toContain("file-149.txt");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("stays capped at 100 rendered rows with 5000 rejected non-image files", async () => {
    const { user } = renderPanel(
      state({ total: 5000, processed: 5000, rejected: entries(5000) }),
    );

    await user.click(screen.getByRole("button", { name: "Show rejected files (5,000)" }));

    expect(screen.getAllByTestId("rejected-row")).toHaveLength(100);
    expect(screen.getByText("…and 4,900 more")).toBeInTheDocument();
  });

  it("shows the cancelled title with the processed count", () => {
    renderPanel(state({ status: "cancelled", total: 10, processed: 4, added: 4 }));

    expect(screen.getByText("Upload cancelled: 4 of 10 files processed")).toBeInTheDocument();
    expect(screen.getByText("Added: 4")).toBeInTheDocument();
  });

  it("lists files of a failed batch and shows the retry hint", () => {
    renderPanel(
      state({
        added: 0,
        rejected: [{ name: "a.jpg", reason: "Upload failed. Try again." }],
        hadRequestFailures: true,
      }),
    );

    expect(
      screen.getByText(
        "Files that failed to send can be uploaded again. Images that were already added are skipped.",
      ),
    ).toBeVisible();
  });

  it("omits the retry hint when no request failed", () => {
    renderPanel(state({ added: 10 }));
    expect(screen.queryByText(/can be uploaded again/)).not.toBeInTheDocument();
  });
});
