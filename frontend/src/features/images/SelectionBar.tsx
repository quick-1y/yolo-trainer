import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { ImageSplit } from "../../api/images";
import { SplitMenu } from "./SplitMenu";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onDelete: () => void;
  onSplit: (split: ImageSplit | null) => void;
  /** True while a split update is running: the menu trigger shows a loader and is disabled. */
  splitPending: boolean;
}

/** Replaces the toolbar while at least one tile is selected (D-11). */
export function SelectionBar({ count, onClear, onDelete, onSplit, splitPending }: SelectionBarProps) {
  const { t } = useTranslation("images");
  return (
    <Group gap={8} mb="md" mih={36}>
      <Text fw={600}>{t("selection.count", { count })}</Text>
      <Button variant="subtle" onClick={onClear}>
        {t("selection.clear")}
      </Button>
      <SplitMenu variant="selection" onSelect={onSplit} loading={splitPending} />
      <Button variant="light" color="red" onClick={onDelete}>
        {t("selection.delete")}
      </Button>
    </Group>
  );
}
