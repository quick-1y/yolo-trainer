import { memo } from "react";
import { Rect } from "react-konva";

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

interface BoxShapeProps {
  box: Box;
  imgW: number;
  imgH: number;
  color: string;
}

/**
 * One box: class-color stroke (2 screen px at any zoom) and an 18% fill.
 * It is not interactive yet - selection arrives with the Select tool.
 */
export const BoxShape = memo(function BoxShape({ box, imgW, imgH, color }: BoxShapeProps) {
  const rect = toPx(box, imgW, imgH);
  return (
    <Rect
      id={`box-${box.id}`}
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      stroke={color}
      strokeWidth={2}
      strokeScaleEnabled={false}
      fill={withAlpha(color, 0.18)}
      listening={false}
    />
  );
});
