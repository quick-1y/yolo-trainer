import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { useEditorModalOpen } from "./useEditorHotkeys";

interface LeaveDialogProps {
  opened: boolean;
  /** A retry is running: the Retry button shows its loading state. */
  retrying: boolean;
  onRetry: () => void;
  onLeave: () => void;
  /** Esc or the close button: stay on the image. */
  onClose: () => void;
}

/**
 * "Changes could not be saved" (D-11): shown when leaving an image whose save failed or
 * conflicts. It never discards silently: Retry saves again and then leaves, Leave anyway
 * is the explicit way out, and closing it keeps the user on the image.
 */
export function LeaveDialog({ opened, retrying, onRetry, onLeave, onClose }: LeaveDialogProps) {
  const { t } = useTranslation("editor");
  // Every editor shortcut is off while this dialog is open (Pitfall 10).
  useEditorModalOpen(opened);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("leave.title")}
      centered
      styles={{ title: { fontSize: 16, fontWeight: 600 } }}
    >
      <Stack gap={16}>
        <Text size="sm">{t("leave.body")}</Text>
        <Group justify="flex-end" gap={8}>
          <Button variant="light" color="red" onClick={onLeave}>
            {t("leave.leave")}
          </Button>
          <Button variant="filled" data-autofocus loading={retrying} onClick={onRetry}>
            {t("leave.retry")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
