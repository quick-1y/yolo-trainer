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

/** One pan in progress: where the pointer and the stage were when it started. */
interface PanGesture {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/** A field that types: Space belongs to it, not to the canvas. */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable === true
  );
}

/** The middle button never starts the browser's autoscroll or a middle-click paste here. */
function preventMiddleButton(event: { button: number; preventDefault: () => void }): void {
  if (event.button === 1) {
    event.preventDefault();
  }
}

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
  /** False while a modal is open: Space no longer pans (and is left to the dialog). */
  keyboardEnabled?: boolean;
  /**
   * The editor cannot change annotations (conflict, orientation mismatch, load failure): boxes
   * and the Transformer are inert, so nothing can be moved or resized. Zoom and pan still work.
   */
  readOnly?: boolean;
  /** The original failed to load: the spinner that stands for "still loading" is not shown. */
  failed?: boolean;
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
  keyboardEnabled = true,
  readOnly = false,
  failed = false,
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
  // Pan: a hand-rolled gesture (never `Stage draggable`: a left drag draws, and Konva's drag
  // would fight the shape drags). The stage moves imperatively; React sees the final position.
  const panRef = useRef<PanGesture | null>(null);
  const justPannedRef = useRef(false);
  const spaceRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
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
    const node =
      selectTool && !readOnly && selectedId !== null ? stage.findOne(`#box-${selectedId}`) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectTool, readOnly, selectedId, boxes, hasStage]);

  // Space turns the left button into a pan. It is read on window so it works wherever focus is
  // (a focused tool button would otherwise be clicked by Space), except in a text field.
  useEffect(() => {
    const release = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    if (!keyboardEnabled) {
      release();
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTextField(event.target)) {
        return;
      }
      event.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }
      if (!isTextField(event.target)) {
        event.preventDefault();
      }
      release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [keyboardEnabled]);

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

  const startPan = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    if (!stage) {
      return;
    }
    // Stops the browser's middle-button autoscroll and text selection while dragging.
    event.evt.preventDefault();
    stage.content.setPointerCapture(event.evt.pointerId);
    panRef.current = {
      pointerId: event.evt.pointerId,
      startX: event.evt.clientX,
      startY: event.evt.clientY,
      originX: stage.x(),
      originY: stage.y(),
    };
    crosshairRef.current?.hide();
    setPanning(true);
  };

  const endPan = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const pan = panRef.current;
    const stage = event.target.getStage();
    if (pan === null || !stage) {
      return;
    }
    panRef.current = null;
    justPannedRef.current = true;
    if (stage.content.hasPointerCapture(pan.pointerId)) {
      stage.content.releasePointerCapture(pan.pointerId);
    }
    // Always commit, even for a zero move: the stage position changed outside React.
    viewport.setView({ scale: stage.scaleX(), x: stage.x(), y: stage.y() });
    setPanning(false);
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    containerRef.current?.focus();
    justPannedRef.current = false;
    const { button } = event.evt;
    // The middle button always pans; the left one pans while Space is held. Neither draws.
    if (button === 1 || (button === 0 && spaceRef.current)) {
      startPan(event);
      return;
    }
    if (!canDraw || button !== 0) {
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
    const pan = panRef.current;
    if (pan !== null) {
      const stage = event.target.getStage();
      if (stage && event.evt.pointerId === pan.pointerId) {
        stage.position({
          x: pan.originX + event.evt.clientX - pan.startX,
          y: pan.originY + event.evt.clientY - pan.startY,
        });
        stage.batchDraw();
      }
      return;
    }
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
    if (panRef.current !== null) {
      endPan(event);
      return;
    }
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
    // A zoom mid-pan would build on a position React has not seen yet.
    if (!pointer || deltaY === 0 || panRef.current !== null) {
      return;
    }
    zoomBy(deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, pointer);
  };

  // A click on empty canvas (the stage itself; the image layer does not listen) deselects.
  const handleStageClick = (event: Konva.KonvaEventObject<Event>) => {
    // The release that ends a pan is not a click on empty canvas.
    if (justPannedRef.current) {
      return;
    }
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
  if (panning) {
    cursor = "grabbing";
  } else if (spaceHeld) {
    cursor = "grab";
  }
  // Boxes and the Transformer are inert while a pan can start, so a press on them pans.
  const panBlocked = spaceHeld || panning;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label={t("canvas.aria")}
      onMouseDown={preventMiddleButton}
      onAuxClick={preventMiddleButton}
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
          onPointerCancel={endPan}
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
                interactive={selectTool && !panBlocked && !readOnly}
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
              listening={!panBlocked && !readOnly}
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
      {image === null && !failed && (
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
