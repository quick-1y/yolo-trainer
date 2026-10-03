import { Box, Text } from "@mantine/core";

import type { ProjectClassItem } from "../../api/classes";

interface ClassRowProps {
  item: ProjectClassItem;
  /** The first row has no top border (the header row already draws one). */
  isFirst?: boolean;
}

// 48px row: index (12px, tabular) · color swatch · name (one line, ellipsis,
// native title with the full name). The swatch background only ever receives
// a server-validated `#RRGGBB` value.
export function ClassRow({ item, isFirst = false }: ClassRowProps) {
  return (
    <Box
      data-testid="class-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 48,
        padding: "0 16px",
        borderTop: isFirst ? undefined : "1px solid var(--mantine-color-dark-4)",
      }}
    >
      <Text
        data-testid="class-index"
        size="xs"
        style={{ width: 48, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
      >
        {item.index}
      </Text>
      <Box
        data-testid="class-swatch"
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          borderRadius: 4,
          background: item.color,
          border: "1px solid rgba(255, 255, 255, 0.24)",
        }}
      />
      <Text size="md" title={item.name} style={{ flex: 1, minWidth: 0 }} truncate="end">
        {item.name}
      </Text>
    </Box>
  );
}
