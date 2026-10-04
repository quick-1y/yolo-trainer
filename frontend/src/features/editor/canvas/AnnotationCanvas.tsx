import { Loader, Paper, useMantineTheme } from "@mantine/core";
import type Konva from "konva";
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";

import type { Box } from "../../../api/annotations";
import {
  type NormBox,
  type Point,
  isTiny,
  normalizeTransform,
  rectFromDrag,
  toNorm,
  toPx,
} from "../lib/geometry";
import type { EditorTool } from "../store/editorUiStore";
import { ZOOM_STEP } from "../lib/viewport";
import { BoxShape, withAlpha } from "./BoxShape";
import { Crosshair, type CrosshairHandle } from "./Crosshair";
import { ZoomOverlay } from "./ZoomOverlay";
import { useStageViewport } from "./useStageViewport";

const MATTE = "#141414";
const FALLBACK_COLOR = "#FFFFFF";
/** From this scale up the image is drawn without smoothing, so pixels stay crisp. */
const CRISP_SCALE = 3;

/** What the editor page may ask of the canvas (Esc cancels a draft in progress). */
export interface AnnotationCanvasHandle {
  /** Drop the draft in progress: nothing is created when the pointer is released. */
  cancelDraft: () => void;
  /** A draft is being dragged out right now. */
  isDrawing: () => boolean;
  /** Move keyboard focus to the canvas (after a control elsewhere took it). */
  focus: () => void;
  /** Zoom and position back to fit (F, 0, the Fit button). */
  fit: () => void;
}

interface AnnotationCanvasProps {
  /** React 19 passes `ref` as a plain prop. */
  ref?: Ref<AnnotationCanvasHandle>;
  /** The decoded original, or null while it loads. */
  image: HTMLImageElement | null;
  /** The image size stored in the database (EXIF-oriented). */
  imgW: number;
  imgH: number;
  boxes: Box[];
  /** Class id to hex color. */
  classColors: Record<number, string>;
  /** Class id to name, drawn on the box chips. */
  labels: Record<number, string>;
  activeColor: string;
  tool: EditorTool;
  selectedId: string | null;
  hoveredId: string | null;
  canDraw: boolean;
  /** The project has no classes yet: show the hint instead of letting a drag draw. */
  noClasses: boolean;
  onCreate: (box: NormBox) => void;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  /** A move or resize finished: the box's new geometry (one gesture, one call). */
  onChange: (id: string, geometry: NormBox) => void;
}

/**
 * The react-konva stage: the original on one layer, boxes + Transformer + the
 * draft on a second, crosshair guides on a third. Zoom and pan live on the
 * Stage (every image opens fit to the window), so `getRelativePointerPosition()`
 * is always in image pixels.
 */
export function AnnotationCanvas({
  ref,
  image,
  imgW,
  imgH,
  boxes,
  classColors,
  labels,
  activeColor,
  tool,
  selectedId,
  hoveredId,
  canDraw,
  noClasses,
  onCreate,
  onSelect,
  onHover,
  onChange,
}: AnnotationCanvasProps) {
  const { t } = useTranslation("editor");
  // react-konva does not carry React context into the stage, so the font is read here.
  const { fontFamily } = useMantineTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const draftRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const crosshairRef = useRef<CrosshairHandle>(null);
  const startRef = useRef<Point | null>(null);
  const pointerIdRef = useRef<number | null>(null);
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

  const hasStage = size.width > 0 && size.height > 0;
  // A new decoded image (or a new size) always opens fit; the user's view lives in the hook.
  const viewport = useStageViewport(size, { width: imgW, height: imgH }, image);
  const { view, zoomBy } = viewport;
  const scale = view.scale;
  const selectTool = tool === "select";

  // The Transformer follows the selected box, only in the Select tool.
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (transformer === null || stage === null) {
      return;
    }
    const node = selectTool && selectedId !== null ? stage.findOne(`#box-${selectedId}`) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectTool, selectedId, boxes, hasStage]);

  // Guides exist only while a drag could start.
  useEffect(() => {
    if (!canDraw) {
      crosshairRef.current?.hide();
    }
  }, [canDraw]);

  // The guides hide when the pointer leaves the canvas (either event family).
  useEffect(() => {
    const content = stageRef.current?.content;
    if (!content) {
      return undefined;
    }
    const hide = () => crosshairRef.current?.hide();
    content.addEventListener("mouseleave", hide);
    content.addEventListener("pointerleave", hide);
    return () => {
      content.removeEventListener("mouseleave", hide);
      content.removeEventListener("pointerleave", hide);
    };
  }, [hasStage]);

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

  // Esc: hide the draft and forget the start point, so the pending pointerup finds
  // nothing to commit. The capture is released here because that pointerup may never come.
  const cancelDraft = () => {
    if (startRef.current === null) {
      return;
    }
    startRef.current = null;
    const content = stageRef.current?.content;
    const pointerId = pointerIdRef.current;
    pointerIdRef.current = null;
    if (content && pointerId !== null && content.hasPointerCapture(pointerId)) {
      content.releasePointerCapture(pointerId);
    }
    hideDraft();
  };

  useImperativeHandle(ref, () => ({
    cancelDraft,
    isDrawing: () => startRef.current !== null,
    focus: () => containerRef.current?.focus(),
    fit: viewport.fit,
  }));

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
    pointerIdRef.current = event.evt.pointerId;
    startRef.current = point;
    showDraft(point, point);
  };

  const handlePointerMove = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const start = startRef.current;
    const point = event.target.getStage()?.getRelativePointerPosition();
    if (!point) {
      return;
    }
    if (start !== null) {
      showDraft(start, point);
    }
    if (canDraw) {
      crosshairRef.current?.show(point);
    }
  };

  const handlePointerUp = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const start = startRef.current;
    if (start === null) {
      return;
    }
    startRef.current = null;
    pointerIdRef.current = null;
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

  // The wheel zooms toward the cursor; Ctrl+wheel (trackpad pinch) follows the same rule.
  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const pointer = event.target.getStage()?.getPointerPosition();
    const { deltaY } = event.evt;
    if (!pointer || deltaY === 0) {
      return;
    }
    zoomBy(deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, pointer);
  };

  // A click on empty canvas (the stage itself; the image layer does not listen) deselects.
  const handleStageClick = (event: Konva.KonvaEventObject<Event>) => {
    if (event.target === event.target.getStage()) {
      onSelect(null);
    }
  };

  // The real work happens on release: read the scaled size, reset the scale and
  // commit once. `boundBoxFunc` only sees absolute screen-space boxes, so it is not used.
  const handleTransformEnd = (id: string, node: Konva.Rect) => {
    const rect = normalizeTransform(
      {
        x: node.x(),
        y: node.y(),
        w: node.width() * node.scaleX(),
        h: node.height() * node.scaleY(),
      },
      imgW,
      imgH,
    );
    const norm = toNorm(rect, imgW, imgH);
    const px = toPx(norm, imgW, imgH);
    // Bake the committed geometry into the node so the scale never lingers, even
    // when the store ignores an unchanged box.
    node.setAttrs({ x: px.x, y: px.y, width: px.w, height: px.h, scaleX: 1, scaleY: 1 });
    onChange(id, norm);
  };

  let cursor = "default";
  if (tool === "box") {
    cursor = noClasses ? "not-allowed" : "crosshair";
  }

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
        cursor,
        outline: "none",
      }}
    >
      {hasStage && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={scale}
          scaleY={scale}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onPointerClick={handleStageClick}
        >
          <Layer listening={false} imageSmoothingEnabled={scale < CRISP_SCALE}>
            {image !== null && <KonvaImage image={image} width={imgW} height={imgH} />}
          </Layer>
          <Layer>
            {boxes.map((box) => (
              <BoxShape
                key={box.id}
                box={box}
                imgW={imgW}
                imgH={imgH}
                color={classColors[box.class_id] ?? FALLBACK_COLOR}
                label={labels[box.class_id] ?? ""}
                fontFamily={fontFamily}
                scale={scale}
                interactive={selectTool}
                selected={box.id === selectedId}
                hovered={box.id === hoveredId}
                onSelect={onSelect}
                onHover={onHover}
                onChange={onChange}
                onTransformEnd={handleTransformEnd}
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
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              flipEnabled={false}
              keepRatio={false}
              ignoreStroke
              anchorSize={10}
              anchorFill="#FFFFFF"
              anchorStroke="#141414"
              anchorStrokeWidth={1}
              borderStroke="#FFFFFF"
              borderStrokeWidth={1}
            />
          </Layer>
          <Crosshair ref={crosshairRef} />
        </Stage>
      )}
      {hasStage && (
        <ZoomOverlay
          scale={scale}
          onZoomIn={() => zoomBy(ZOOM_STEP)}
          onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
          onFit={viewport.fit}
        />
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
