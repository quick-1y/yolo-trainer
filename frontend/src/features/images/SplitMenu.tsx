import { Button, Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { ImageSplit } from "../../api/images";

const SPLITS: readonly ImageSplit[] = ["train", "valid", "test"];

interface SplitMenuProps {
  /**
   * The current split (`null` = none), marked with a check in the menu. The editor trigger
   * also shows it; leave it undefined in the selection bar, which marks nothing.
   */
  value?: ImageSplit | null;
  onSelect: (split: ImageSplit | null) => void;
  variant: "selection" | "editor";
  loading?: boolean;
  disabled?: boolean;
  /** Editor only: the 1440 px and wider form with the "Split:" prefix and a 176 px max width. */
  wide?: boolean;
}

/** Glyph that is part of a label: 4px from the text, hidden from assistive technology. */
function Caret() {
  return (
    <span aria-hidden="true" style={{ marginInlineStart: 4, flexShrink: 0 }}>
      ▾
    </span>
  );
}

const ELLIPSIS = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/**
 * The split menu shared by the grid's selection bar and the editor top bar (D-02a, D-02b):
 * Train, Valid, Test, a divider, then No split. A glyph that is part of a label sits in a
 * 4px-spaced aria-hidden span, never in a Mantine button section (UI-SPEC "Spacing Scale").
 */
export function SplitMenu({
  value,
  onSelect,
  variant,
  loading = false,
  disabled = false,
  wide = false,
}: SplitMenuProps) {
  const { t } = useTranslation("images");

  const item = (split: ImageSplit | null) => (
    <Menu.Item key={split ?? "none"} onClick={() => onSelect(split)}>
      {t(`split.value.${split ?? "none"}`)}
      {value !== undefined && value === split && (
        <span aria-hidden="true" style={{ marginInlineStart: 8 }}>
          ✓
        </span>
      )}
    </Menu.Item>
  );

  const inactive = disabled || loading;
  let trigger;
  if (variant === "selection") {
    trigger = (
      <Button variant="default" loading={loading} disabled={inactive}>
        {t("selection.setSplit")}
        <Caret />
      </Button>
    );
  } else {
    const current = t(`split.value.${value ?? "none"}`);
    const aria = t("split.aria", { value: current });
    // 1440 px and wider: "Split: Train ▾", up to 176 px with an ellipsis. Narrower: the value
    // alone in a fixed 104 px trigger (it fits "Валидация" and "Не назначена"), the full text
    // as the tooltip. Both carry the full text as their accessible name.
    trigger = wide ? (
      <Button variant="default" size="sm" maw={176} aria-label={aria} loading={loading} disabled={inactive}>
        <span style={ELLIPSIS}>{aria}</span>
        <Caret />
      </Button>
    ) : (
      <Button
        variant="default"
        size="sm"
        w={104}
        px={8}
        aria-label={aria}
        loading={loading}
        disabled={inactive}
      >
        <span style={ELLIPSIS}>{current}</span>
        <Caret />
      </Button>
    );
    // A disabled button swallows pointer events, so the Tooltip sits on a wrapper.
    trigger = (
      <Tooltip label={aria} openDelay={400} disabled={wide}>
        <div style={{ flexShrink: 0, display: "flex" }}>
          <Menu.Target>{trigger}</Menu.Target>
        </div>
      </Tooltip>
    );
  }

  return (
    <Menu width={200} position="bottom-start" disabled={inactive}>
      {variant === "selection" ? <Menu.Target>{trigger}</Menu.Target> : trigger}
      <Menu.Dropdown>
        {SPLITS.map((split) => item(split))}
        <Menu.Divider />
        {item(null)}
      </Menu.Dropdown>
    </Menu>
  );
}
