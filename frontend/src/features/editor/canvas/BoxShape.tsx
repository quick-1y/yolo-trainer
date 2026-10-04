import type Konva from "konva";
import { memo } from "react";
import { Group, Label, Rect, Tag, Text } from "react-konva";

import type { Box } from "../../../api/annotations";
import { toPx } from "../lib/geometry";

/** `#RRGGBB` plus an alpha in [0, 1] as a CSS color the canvas understands. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Text color for a label chip: black on a light class color, white on a dark one (WCAG relative luminance). */
export function labelTextColor(hex: string): "#000000" | "#FFFFFF" {
  const value = Number.parseInt(hex.slice(1), 16);
  const luminance =
    0.2126 * linear((value >> 16) & 0xff) +
    0.7152 * linear((value >> 8) & 0xff) +
    0.0722 * linear(value & 0xff);
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/** Longest class name drawn on a chip, ellipsis included. */
const LABEL_MAX_CHARS = 24;

/** The class name as shown on the chip: at most 24 characters, the last one an ellipsis when cut. */
export function truncateLabel(name: string): string {
  const chars = Array.from(name);
  return chars.length <= LABEL_MAX_CHARS ? name : `${chars.slice(0, LABEL_MAX_CHARS - 1).join("")}…`;
}

/** Chip metrics in SCREEN pixels; they are divided by the stage scale when drawn. */
const CHIP_HEIGHT = 16;
const CHIP_PADDING = 4;
const CHIP_FONT = 12;

interface BoxShapeProps {
  box: Box;
  imgW: number;
  imgH: number;
  color: string;
  /** The class name shown on the chip. */
  label: string;
  fontFamily: string;
  /** Stage scale (screen px per image px); keeps strokes, chips and text constant on screen. */
  scale: number;
  /** Select tool: the box listens and can be dragged. Box tool: it is inert (Pitfall 7). */
  interactive: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * One box: class-color stroke (2 screen px, 3 hovered at any zoom), an 18% fill
 * (30% hovered or selected) and a class-name chip.
 */
export const BoxShape = memo(function BoxShape({
  box,
  imgW,
  imgH,
  color,
  label,
  fontFamily,
  scale,
  interactive,
  selected,
  hovered,
  onSelect,
  onHover,
}: BoxShapeProps) {
  const rect = toPx(box, imgW, imgH);
  const chipHeight = CHIP_HEIGHT / scale;
  // Chip above the top-left corner; inside the box when that would leave the image.
  const chipY = rect.y - chipHeight < 0 ? rect.y : rect.y - chipHeight;

  const enter = (event: Konva.KonvaEventObject<Event>) => {
    onHover(box.id);
    event.target.getStage()?.content.style.setProperty("cursor", "move");
  };
  const leave = (event: Konva.KonvaEventObject<Event>) => {
    onHover(null);
    event.target.getStage()?.content.style.removeProperty("cursor");
  };

  return (
    <Group>
      <Rect
        id={`box-${box.id}`}
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        stroke={color}
        strokeWidth={hovered ? 3 : 2}
        strokeScaleEnabled={false}
        hitStrokeWidth={8}
        fill={withAlpha(color, hovered || selected ? 0.3 : 0.18)}
        listening={interactive}
        draggable={interactive}
        // Konva fires `click` for mouse events and `pointerclick` for pointer events
        // (and `tap` for touch); selecting twice is harmless.
        onClick={() => onSelect(box.id)}
        onPointerClick={() => onSelect(box.id)}
        onTap={() => onSelect(box.id)}
        onDragStart={() => onSelect(box.id)}
        onMouseEnter={enter}
        onPointerEnter={enter}
        onMouseLeave={leave}
        onPointerLeave={leave}
      />
      <Label id={`label-${box.id}`} x={rect.x} y={chipY} listening={false}>
        <Tag fill={color} />
        <Text
          text={truncateLabel(label)}
          fontFamily={fontFamily}
          fontSize={CHIP_FONT / scale}
          // Line height 2/3 makes the chip exactly 16 screen px with 4 px padding all round.
          lineHeight={(CHIP_HEIGHT - 2 * CHIP_PADDING) / CHIP_FONT}
          padding={CHIP_PADDING / scale}
          fill={labelTextColor(color)}
          wrap="none"
        />
      </Label>
    </Group>
  );
});
