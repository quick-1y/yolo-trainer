import type Konva from "konva";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Layer, Line } from "react-konva";

import type { Point } from "../lib/geometry";

export interface CrosshairHandle {
  /** Draw the guides through `point` (image coordinates). */
  show: (point: Point) => void;
  hide: () => void;
}

// One shared array: a fresh literal per render would reset the points set imperatively.
const NO_POINTS = [0, 0, 0, 0];

const LINE = {
  stroke: "rgba(255,255,255,0.7)",
  strokeWidth: 1,
  strokeScaleEnabled: false,
  // A dark halo so the guides read on both light and dark images.
  shadowColor: "rgba(0,0,0,0.6)",
  shadowBlur: 2,
  shadowOpacity: 1,
  visible: false,
  listening: false,
  name: "crosshair-line",
} as const;

/**
 * Full-viewport crosshair guides in the Box tool. They are updated through an
 * imperative handle and `batchDraw`, never through React state: a pointer move
 * must not re-render the editor.
 */
export const Crosshair = forwardRef<CrosshairHandle>(function Crosshair(_props, ref) {
  const layerRef = useRef<Konva.Layer>(null);
  const verticalRef = useRef<Konva.Line>(null);
  const horizontalRef = useRef<Konva.Line>(null);

  useImperativeHandle(
    ref,
    () => ({
      show(point) {
        const layer = layerRef.current;
        const vertical = verticalRef.current;
        const horizontal = horizontalRef.current;
        const stage = layer?.getStage();
        if (!layer || !vertical || !horizontal || !stage) {
          return;
        }
        // The visible viewport in image coordinates, from the stage position and scale.
        const scale = stage.scaleX();
        const left = -stage.x() / scale;
        const top = -stage.y() / scale;
        const right = left + stage.width() / scale;
        const bottom = top + stage.height() / scale;
        vertical.setAttrs({ points: [point.x, top, point.x, bottom], visible: true });
        horizontal.setAttrs({ points: [left, point.y, right, point.y], visible: true });
        layer.batchDraw();
      },
      hide() {
        const layer = layerRef.current;
        if (!layer || !verticalRef.current || !horizontalRef.current) {
          return;
        }
        verticalRef.current.visible(false);
        horizontalRef.current.visible(false);
        layer.batchDraw();
      },
    }),
    [],
  );

  return (
    <Layer ref={layerRef} listening={false}>
      <Line ref={verticalRef} points={NO_POINTS} {...LINE} />
      <Line ref={horizontalRef} points={NO_POINTS} {...LINE} />
    </Layer>
  );
});
