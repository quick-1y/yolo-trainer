import { Alert, Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface ConflictBannerProps {
  /** Refetch the image's annotations and drop the local history (D-12). */
  onReload: () => void;
}

/**
 * The 409 banner: the image was saved from somewhere else, so this copy must not overwrite it.
 * It sits across the top of the canvas column; the editor is read-only until Reload.
 */
export function ConflictBanner({ onReload }: ConflictBannerProps) {
  const { t } = useTranslation("editor");

  return (
    <Alert
      role="alert"
      color="red"
      variant="filled"
      radius={0}
      p={0}
      px={16}
      styles={{
        root: { position: "absolute", top: 0, left: 0, right: 0, height: 40, zIndex: 3 },
        wrapper: { height: "100%", alignItems: "center" },
        body: { flex: 1, minWidth: 0 },
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap={16}>
        <Text size="sm" fw={500} truncate="end" title={t("conflict.message")}>
          {t("conflict.message")}
        </Text>
        <Button variant="white" color="red" size="compact-sm" style={{ flexShrink: 0 }} onClick={onReload}>
          {t("conflict.reload")}
        </Button>
      </Group>
    </Alert>
  );
}
