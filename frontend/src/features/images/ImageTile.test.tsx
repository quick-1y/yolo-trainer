import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ImageItem } from "../../api/images";
import i18n from "../../i18n";
import { makeImageItem } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { ImageTile } from "./ImageTile";

function renderTile(image: ImageItem, language = "en") {
  return renderWithProviders(
    <ImageTile
      projectId={7}
      image={image}
      index={0}
      onOpen={() => undefined}
      selected={false}
      selecting={false}
      onToggleSelect={() => undefined}
    />,
    { language },
  );
}

const STATUS_CASES: {
  name: string;
  image: Partial<ImageItem>;
  label: string;
  glyph: string;
}[] = [
  { name: "unannotated", image: {}, label: "Unannotated", glyph: "○" },
  {
    name: "annotated",
    image: { box_count: 2, status: "annotated" },
    label: "Annotated",
    glyph: "●",
  },
  {
    name: "reviewed",
    image: { box_count: 2, status: "reviewed", is_reviewed: true },
    label: "Reviewed",
    glyph: "✓",
  },
  {
    name: "background",
    image: { status: "annotated", is_background: true },
    label: "Background",
    glyph: "∅",
  },
];

describe("ImageTile status chip", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each(STATUS_CASES)("shows the $name chip with its glyph and label", ({ image, label, glyph }) => {
    renderTile(makeImageItem(image));

    const chip = screen.getByLabelText(label);
    expect(chip).toHaveAttribute("title", label);
    expect(chip).toHaveTextContent(glyph);
    expect(screen.getByTestId("status-badge-slot")).toContainElement(chip);
  });

  it("names the tile after the file and its status", () => {
    renderTile(makeImageItem({ id: 1 }));

    expect(screen.getByRole("button", { name: "img-1.jpg, Unannotated" })).toBeInTheDocument();
  });

  it("names the tile in Russian", async () => {
    renderTile(makeImageItem({ id: 1 }), "ru");

    expect(await screen.findByRole("button", { name: "img-1.jpg, Не размечено" })).toBeInTheDocument();
    expect(screen.getByLabelText("Не размечено")).toHaveTextContent("○");
  });

  it("lets reviewed beat background on the chip", () => {
    renderTile(
      makeImageItem({ status: "reviewed", is_reviewed: true, is_background: true }),
    );

    expect(screen.getByLabelText("Reviewed")).toHaveTextContent("✓");
    expect(screen.queryByLabelText("Background")).toBeNull();
  });
});

describe("ImageTile box count", () => {
  it("shows the number of boxes as a pill", () => {
    renderTile(makeImageItem({ box_count: 3, status: "annotated" }));

    const pill = screen.getByLabelText("Objects: 3");
    expect(pill).toHaveTextContent(/^3$/);
  });

  it("hides the pill when the image has no boxes", () => {
    renderTile(makeImageItem({ box_count: 0 }));

    expect(screen.queryByLabelText(/^Objects:/)).toBeNull();
  });

  it("labels the pill in Russian", async () => {
    renderTile(makeImageItem({ box_count: 5, status: "annotated" }), "ru");

    expect(await screen.findByLabelText("Объектов: 5")).toHaveTextContent(/^5$/);
    await i18n.changeLanguage("en");
  });
});

describe("ImageTile split pill", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the translated split name as a pill with an aria-label", () => {
    renderTile(makeImageItem({ split: "valid" }));

    const pill = screen.getByLabelText("Split: Valid");
    expect(pill).toHaveTextContent(/^Valid$/);
    expect(pill).toHaveAttribute("role", "img");
  });

  it.each([
    ["train", "Train"],
    ["valid", "Valid"],
    ["test", "Test"],
  ] as const)("names the %s split", (split, label) => {
    renderTile(makeImageItem({ split }));

    expect(screen.getByLabelText(`Split: ${label}`)).toHaveTextContent(label);
  });

  it("shows no pill for an unassigned image", () => {
    renderTile(makeImageItem({ split: null }));

    expect(screen.queryByLabelText(/^Split:/)).toBeNull();
  });

  it("reads Валидация in Russian", async () => {
    renderTile(makeImageItem({ split: "valid" }), "ru");

    expect(await screen.findByLabelText("Выборка: Валидация")).toHaveTextContent(/^Валидация$/);
  });

  it("keeps the tile name and the box-count pill as they were", () => {
    renderTile(makeImageItem({ id: 1, split: "train", box_count: 3, status: "annotated" }));

    expect(screen.getByRole("button", { name: "img-1.jpg, Annotated" })).toBeInTheDocument();
    expect(screen.getByLabelText("Objects: 3")).toHaveTextContent(/^3$/);
    expect(screen.getByLabelText("Split: Train")).toBeInTheDocument();
  });
});
