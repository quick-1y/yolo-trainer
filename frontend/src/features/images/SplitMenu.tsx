import { Button, Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { ImageSplit } from "../../api/images";

const SPLITS: readonly ImageSplit[] = ["train", "valid", "test"];

interface SplitMenuProps {
  /** The current split (`null` = none) to mark with a check; leave undefined to mark nothing. */
  value?: ImageSplit | null;
  onSelect: (split: ImageSplit | null) => void;
  variant: "selection" | "editor";
  loading?: boolean;
  disabled?: boolean;
  /** Editor only: the 1440 px and wider form with the text prefix. */
  wide?: boolean;
}

/**
 * The split menu shared by the grid's selection bar and the editor top bar (D-02a, D-02b):
 * Train, Valid, Test, a divider, then No split. A glyph that is part of a label sits in a
 * 4px-spaced aria-hidden span, never in leftSection/rightSection (UI-SPEC "Spacing Scale").
 */
export function SplitMenu({ value, onSelect, variant, loading = false, disabled = false }: SplitMenuProps) {
  const { t } = useTranslation("images");
  // Only the selection trigger exists so far; `variant` is the seam for the editor form.
  void variant;

  const item = (split: ImageSplit | null) => {
    const label = t(`split.value.${split ?? "none"}`);
    return (
      <Menu.Item key={split ?? "none"} onClick={() => onSelect(split)}>
        {label}
        {value !== undefined && value === split && (
          <span aria-hidden="true" style={{ marginInlineStart: 8 }}>
            ✓
          </span>
        )}
      </Menu.Item>
    );
  };

  return (
    <Menu width={200} position="bottom-start" disabled={disabled || loading}>
      <Menu.Target>
        <Button variant="default" loading={loading} disabled={disabled || loading}>
          {t("selection.setSplit")}
          <span aria-hidden="true" style={{ marginInlineStart: 4 }}>
            ▾
          </span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {SPLITS.map((split) => item(split))}
        <Menu.Divider />
        {item(null)}
      </Menu.Dropdown>
    </Menu>
  );
}
