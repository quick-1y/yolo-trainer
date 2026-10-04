import { Loader, Paper } from "@mantine/core";
import type Konva from "konva";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";

import type { Box } from "../../../api/annotations";
import {
  type NormBox,
  type Point,
  isTiny,
  rectFromDrag,
  toNorm,
} from "../lib/geometry";
import { BoxShape, withAlpha } from "./BoxShape";

/** Free space kept around the image when it is fitted to the window (24 px a side). */
const FIT_MARGIN = 48;
/** Small images are magnified up to 400 %, never beyond. */
const MAX_FIT_SCALE = 4;
const MATTE = "#141414";
const FALLBACK_COLOR = "#FFFFFF";

/** Scale that fits the image into the container; falls back to 1 on a zero or bad size. */
function fitScale(width: number, height: number, imgW: number, imgH: number): number {
  const scale = Math.min((width - FIT_MARGIN) / imgW, (height - FIT_MARGIN) / imgH, MAX_FIT_SCALE);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

interface AnnotationCanvasProps {
  /** The decoded original, or null while it loads. */
  image: HTMLImageElement | null;
  /** The image size stored in the database (EXIF-oriented). */
  imgW: number;
  imgH: number;
  boxes: Box[];
  /** Class id to hex color. */
  classColors: Record<number, string>;
  activeColor: string;
  canDraw: boolean;
  /** The project has no classes yet: show the hint instead of letting a drag draw. */
  noClasses: boolean;
  onCreate: (box: NormBox) => void;
}

/**
 * The react-konva stage: the original on one layer, boxes and the draft on a
 * second. Zoom and pan live on the Stage (it is fitted to the window here), so
 * `getRelativePointerPosition()` is always in image pixels.
 */
export function AnnotationCanvas({
  image,
  imgW,
  imgH,
  boxes,
  classColors,
  activeColor,
  canDraw,
  noClasses,
  onCreate,
}: AnnotationCanvasProps) {
  const { t } = useTranslation("editor");
  const containerRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<Konva.Rect>(null);
  const startRef = useRef<Point | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) {
      return undefined;
    }
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = fitScale(size.width, size.height, imgW, imgH);
  const offsetX = (size.width - imgW * scale) / 2;
  const offsetY = (size.height - imgH * scale) / 2;

  const showDraft = (from: Point, to: Point) => {
    const draft = draftRef.current;
    if (draft === null) {
      return;
    }
    const rect = rectFromDrag(from, to, imgW, imgH);
    draft.setAttrs({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, visible: true });
    draft.getLayer()?.batchDraw();
  };

  const hideDraft = () => {
    const draft = draftRef.current;
    if (draft === null) {
      return;
    }
    draft.visible(false);
    draft.getLayer()?.batchDraw();
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    containerRef.current?.focus();
    if (!canDraw || event.evt.button !== 0) {
      return;
    }
    const stage = event.target.getStage();
    const point = stage?.getRelativePointerPosition();
    if (!stage || !point) {
      return;
    }
    // Mandatory: without capture a release outside the canvas is never delivered
    // and the draft would stay stuck.
    stage.content.setPointerCapture(event.evt.pointerId);
    startRef.current = point;
    showDraft(point, point);
  };

  const handlePointerMove = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const start = startRef.current;
    const point = event.target.getStage()?.getRelativePointerPosition();
    if (start !== null && point) {
      showDraft(start, point);
    }
  };

  const handlePointerUp = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const start = startRef.current;
    if (start === null) {
      return;
    }
    startRef.current = null;
    const stage = event.target.getStage();
    const end = stage?.getRelativePointerPosition() ?? start;
    if (stage?.content.hasPointerCapture(event.evt.pointerId)) {
      stage.content.releasePointerCapture(event.evt.pointerId);
    }
    hideDraft();

    const rect = rectFromDrag(start, end, imgW, imgH);
    if (isTiny(rect, scale)) {
      return;
    }
    const norm = toNorm(rect, imgW, imgH);
    if (norm.w > 0 && norm.h > 0) {
      onCreate(norm);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label={t("canvas.aria")}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: MATTE,
        cursor: canDraw ? "crosshair" : "default",
        outline: "none",
      }}
    >
      {size.width > 0 && size.height > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          x={offsetX}
          y={offsetY}
          scaleX={scale}
          scaleY={scale}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <Layer listening={false}>
            {image !== null && <KonvaImage image={image} width={imgW} height={imgH} />}
          </Layer>
          <Layer listening={false}>
            {boxes.map((box) => (
              <BoxShape
                key={box.id}
                box={box}
                imgW={imgW}
                imgH={imgH}
                color={classColors[box.class_id] ?? FALLBACK_COLOR}
              />
            ))}
            <Rect
              ref={draftRef}
              visible={false}
              listening={false}
              stroke={activeColor}
              strokeWidth={2}
              strokeScaleEnabled={false}
              dash={[6, 4]}
              fill={withAlpha(activeColor, 0.18)}
            />
          </Layer>
        </Stage>
      )}
      {image === null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Loader size={32} />
        </div>
      )}
      {noClasses && <HintChip>{t("canvas.noClassesHint")}</HintChip>}
    </div>
  );
}

function HintChip({ children }: { children: string }) {
  return (
    <Paper
      bg="dark.7"
      radius="md"
      px={16}
      py={8}
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
      }}
    >
      <span style={{ fontSize: 14, color: "var(--mantine-color-dark-1)" }}>{children}</span>
    </Paper>
  );
}
