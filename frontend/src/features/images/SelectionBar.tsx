import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onDelete: () => void;
}

/** Replaces the toolbar while at least one tile is selected (D-11). */
export function SelectionBar({ count, onClear, onDelete }: SelectionBarProps) {
  const { t } = useTranslation("images");
  return (
    <Group gap={8} mb="md" mih={36}>
      <Text fw={500}>{t("selection.count", { count })}</Text>
      <Button variant="subtle" onClick={onClear}>
        {t("selection.clear")}
      </Button>
      <Button variant="light" color="red" onClick={onDelete}>
        {t("selection.delete")}
      </Button>
    </Group>
  );
}
