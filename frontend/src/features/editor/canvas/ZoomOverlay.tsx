import { ActionIcon, Button, Group, Paper } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface ZoomOverlayProps {
  /** Stage scale: screen px per image px. */
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

/**
 * The zoom pill in the canvas's bottom-left corner: zoom out, the percent of the
 * natural size, zoom in, and Fit. It sits above the stage in the DOM, so a click
 * here never reaches the Konva stage.
 */
export function ZoomOverlay({ scale, onZoomIn, onZoomOut, onFit }: ZoomOverlayProps) {
  const { t } = useTranslation("editor");
  return (
    <Paper
      bg="#242424"
      radius={8}
      px={8}
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        height: 32,
        display: "flex",
        alignItems: "center",
        border: "1px solid var(--mantine-color-dark-4)",
      }}
    >
      <Group gap={4} wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          size={24}
          aria-label={t("canvas.zoomOut")}
          onClick={onZoomOut}
        >
          −
        </ActionIcon>
        <span
          aria-live="off"
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            minWidth: 40,
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
            color: "var(--mantine-color-dark-0)",
          }}
        >
          {`${Math.round(scale * 100)}%`}
        </span>
        <ActionIcon
          variant="subtle"
          color="gray"
          size={24}
          aria-label={t("canvas.zoomIn")}
          onClick={onZoomIn}
        >
          +
        </ActionIcon>
        <Button
          variant="subtle"
          size="compact-xs"
          aria-label={t("canvas.fitAria")}
          onClick={onFit}
        >
          {t("canvas.fit")}
        </Button>
      </Group>
    </Paper>
  );
}
