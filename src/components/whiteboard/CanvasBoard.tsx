import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  Canvas,
  PencilBrush,
  Rect,
  Circle,
  Line,
  Path,
  Triangle,
  Group,
  IText,
  FabricImage,
  type FabricObject,
  type TPointerEventInfo,
  type TPointerEvent,
} from "fabric";
import { BOARD_WIDTH, BOARD_HEIGHT, MIN_ZOOM, MAX_ZOOM } from "@/constants/board";
import { parseBoardSnapshot, serializeBoard } from "@/utils/boardSerialization";
import { createShapeObject, createTableObject, type ShapePreset } from "./mathShapes";

export type ToolName = "select" | "pen" | "move" | "eraser" | "text" | "line" | "rect" | "circle" | "arrow";

export interface CanvasBoardHandle {
  loadFromJSON: (json: string | null) => Promise<void>;
  exportJSON: () => string;
  exportDataURL: () => string;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  setBackgroundImage: (url: string | null) => Promise<void>;
  addShape: (preset: ShapePreset, fill?: string) => void;
  addTable: (rows: number, columns: number) => void;
  addMathText: (value: string) => void;
}

interface CanvasBoardProps {
  tool: ToolName;
  color: string;
  strokeWidth: number;
  readOnly?: boolean;
  pageKey: string;
  onContentChange?: (json: string) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onToolConsumed?: () => void;
  onZoomChange?: (percent: number) => void;
  eraserSize?: number;
}

const HISTORY_LIMIT = 60;

export function calculateCanvasViewport(containerWidth: number, _containerHeight: number, zoom = 1) {
  // The work surface is three logical view-heights tall and scrolls vertically.
  // Fit to the pane width so a wide monitor does not leave unused space at right.
  const scale = (containerWidth / BOARD_WIDTH) * zoom;
  return { scale, width: BOARD_WIDTH * scale, height: BOARD_HEIGHT * scale };
}

export function viewportPointToScene(x: number, y: number, scale: number, offsetX = 0, offsetY = 0) {
  return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
}

export type ViewportTransform = [number, number, number, number, number, number];

export function translateViewportTransform(
  transform: ViewportTransform,
  deltaX: number,
  deltaY: number
): ViewportTransform {
  return [transform[0], transform[1], transform[2], transform[3], transform[4] + deltaX, transform[5] + deltaY];
}

export function isPanTool(tool: ToolName) {
  return tool === "move";
}

export function shouldCommitCanvasChange(readOnly: boolean, suppressed: boolean) {
  return !readOnly && !suppressed;
}

export function getCanvasObjectInteraction(tool: ToolName, readOnly = false) {
  if (readOnly) return { selectable: false, evented: false };
  return {
    selectable: tool === "select",
    evented: tool === "select",
  };
}

export function normalizedZoomPercent(zoom: number) {
  return Math.round(zoom * 100);
}

export interface EraserPoint { x: number; y: number }

export function getEraserSceneStrokeWidth(size: number, viewportScale: number) {
  return Math.max(0.1, size / Math.max(viewportScale, 0.01));
}

export function createEraserCursor(size: number) {
  const diameter = Math.max(10, Math.min(60, Math.round(size)));
  const extent = diameter + 2;
  const center = extent / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${extent}" height="${extent}" viewBox="0 0 ${extent} ${extent}"><circle cx="${center}" cy="${center}" r="${diameter / 2}" fill="none" stroke="white" stroke-width="3"/><circle cx="${center}" cy="${center}" r="${diameter / 2}" fill="none" stroke="#303238" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}

function eraserCommands(points: EraserPoint[]) {
  const first = points[0] ?? { x: 0, y: 0 };
  // A tiny round-capped segment makes a click erase a circular dab.
  return [
    ["M", first.x, first.y],
    ...(points.length > 1 ? points.slice(1).map(({ x, y }) => ["L", x, y]) : [["L", first.x + 0.01, first.y]]),
  ] as never;
}

export function createEraserPath(points: EraserPoint[], size: number, viewportScale: number) {
  return new Path(eraserCommands(points), {
    fill: "",
    stroke: "#000000",
    strokeWidth: getEraserSceneStrokeWidth(size, viewportScale),
    strokeLineCap: "round",
    strokeLineJoin: "round",
    globalCompositeOperation: "destination-out",
    selectable: false,
    evented: false,
    objectCaching: false,
  });
}

export function updateEraserPath(path: Path, points: EraserPoint[]) {
  path._setPath(eraserCommands(points), true);
  path.dirty = true;
  path.setCoords();
}

export function moveCanvasHistoryIndex(index: number, stackLength: number, direction: "undo" | "redo") {
  return direction === "undo"
    ? Math.max(0, index - 1)
    : Math.min(stackLength - 1, index + 1);
}

export const CanvasBoard = forwardRef<CanvasBoardHandle, CanvasBoardProps>(function CanvasBoard(
  { tool, color, strokeWidth, readOnly, pageKey, onContentChange, onHistoryChange, onToolConsumed, onZoomChange, eraserSize = 20 },
  ref
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const toolRef = useRef<ToolName>(tool);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  const eraserSizeRef = useRef(eraserSize);
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const suppressRef = useRef(false);
  const drawingShapeRef = useRef<FabricObject | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const erasingRef = useRef(false);
  const eraserPathRef = useRef<Path | null>(null);
  const eraserPointsRef = useRef<EraserPoint[]>([]);
  const panningRef = useRef<{ x: number; y: number } | null>(null);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const loadGenerationRef = useRef(0);
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const onContentChangeRef = useRef(onContentChange);
  const onHistoryChangeRef = useRef(onHistoryChange);
  const onToolConsumedRef = useRef(onToolConsumed);
  const onZoomChangeRef = useRef(onZoomChange);

  toolRef.current = tool;
  colorRef.current = color;
  strokeWidthRef.current = strokeWidth;
  eraserSizeRef.current = eraserSize;
  onContentChangeRef.current = onContentChange;
  onHistoryChangeRef.current = onHistoryChange;
  onToolConsumedRef.current = onToolConsumed;
  onZoomChangeRef.current = onZoomChange;

  const reportHistory = useCallback(() => {
    const { stack, index } = historyRef.current;
    onHistoryChangeRef.current?.({ canUndo: index > 0, canRedo: index < stack.length - 1 });
  }, []);

  const pushHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !shouldCommitCanvasChange(Boolean(readOnly), suppressRef.current)) return;
    const json = serializeBoard(canvas);
    const h = historyRef.current;
    if (h.index >= 0 && h.stack[h.index] === json) return;
    const next = h.stack.slice(0, h.index + 1);
    next.push(json);
    if (next.length > HISTORY_LIMIT) next.shift();
    historyRef.current = { stack: next, index: next.length - 1 };
    reportHistory();
    onContentChangeRef.current?.(json);
  }, [readOnly, reportHistory]);

  const applyViewportScale = useCallback(() => {
    const canvas = fabricRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const wrapperStyle = window.getComputedStyle(wrapper);
    const horizontalPadding = Number.parseFloat(wrapperStyle.paddingLeft) + Number.parseFloat(wrapperStyle.paddingRight);
    const containerWidth = wrapper.clientWidth - horizontalPadding;
    const containerHeight = wrapper.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) return;
    const dimensions = calculateCanvasViewport(containerWidth, containerHeight, zoomRef.current);
    canvas.setDimensions({ width: dimensions.width, height: dimensions.height });
    const scale = dimensions.scale;
    canvas.setViewportTransform([
      scale, 0, 0, scale,
      panOffsetRef.current.x * scale,
      panOffsetRef.current.y * scale,
    ]);
  }, []);

  // ---- init ----
  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new Canvas(canvasElRef.current, {
      backgroundColor: "#ffffff",
      selection: !readOnly,
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;
    canvas.freeDrawingBrush = new PencilBrush(canvas);

    const commit = () => {
      if (suppressRef.current) return;
      pushHistory();
    };

    canvas.on("path:created", commit);
    canvas.on("object:added", commit);
    canvas.on("object:modified", commit);
    canvas.on("text:editing:exited", commit);
    canvas.on("object:removed", () => {
      if (!suppressRef.current) commit();
    });

    canvas.on("mouse:down", (opt: TPointerEventInfo<TPointerEvent>) => {
      if (readOnly) return;
      const t = toolRef.current;
      if (isPanTool(t)) {
        const point = canvas.getViewportPoint(opt.e);
        panningRef.current = { x: point.x, y: point.y };
        canvas.defaultCursor = "grabbing";
        return;
      }
      const pointer = canvas.getScenePoint(opt.e);

      if (t === "text") {
        const text = new IText("Text", {
          left: pointer.x,
          top: pointer.y,
          fontSize: 28,
          fill: colorRef.current,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        onToolConsumedRef.current?.();
        return;
      }

      if (t === "eraser") {
        erasingRef.current = true;
        suppressRef.current = true;
        const scale = canvas.viewportTransform[0] || 1;
        const point = canvas.getScenePoint(opt.e);
        eraserPointsRef.current = [{ x: point.x, y: point.y }];
        const path = createEraserPath(eraserPointsRef.current, eraserSizeRef.current, scale);
        eraserPathRef.current = path;
        canvas.add(path);
        canvas.requestRenderAll();
        return;
      }

      if (t === "rect" || t === "circle" || t === "line" || t === "arrow") {
        startPointRef.current = { x: pointer.x, y: pointer.y };
        suppressRef.current = true;
        let shape: FabricObject;
        const common = {
          stroke: colorRef.current,
          strokeWidth: strokeWidthRef.current,
          fill: "transparent",
          selectable: false,
          evented: false,
        };
        if (t === "rect") {
          shape = new Rect({ ...common, left: pointer.x, top: pointer.y, width: 1, height: 1 });
        } else if (t === "circle") {
          shape = new Circle({ ...common, left: pointer.x, top: pointer.y, radius: 1 });
        } else {
          shape = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            ...common,
            fill: undefined,
          });
        }
        canvas.add(shape);
        drawingShapeRef.current = shape;
      }
    });

    canvas.on("mouse:move", (opt: TPointerEventInfo<TPointerEvent>) => {
      if (readOnly) return;
      const t = toolRef.current;
      if (isPanTool(t) && panningRef.current) {
        const point = canvas.getViewportPoint(opt.e);
        const previous = panningRef.current;
        const scale = canvas.viewportTransform[0] || 1;
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        panOffsetRef.current.x += dx / scale;
        panOffsetRef.current.y += dy / scale;
        panningRef.current = point;
        canvas.setViewportTransform(translateViewportTransform(canvas.viewportTransform, dx, dy));
        return;
      }
      const pointer = canvas.getScenePoint(opt.e);

      if (t === "eraser" && erasingRef.current) {
        const previous = eraserPointsRef.current.at(-1);
        if (!previous || Math.hypot(pointer.x - previous.x, pointer.y - previous.y) >= 0.5) {
          eraserPointsRef.current.push({ x: pointer.x, y: pointer.y });
          const eraserPath = eraserPathRef.current;
          if (eraserPath) updateEraserPath(eraserPath, eraserPointsRef.current);
          canvas.requestRenderAll();
        }
        return;
      }

      const shape = drawingShapeRef.current;
      const start = startPointRef.current;
      if (!shape || !start) return;

      if (shape instanceof Rect) {
        shape.set({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          width: Math.abs(pointer.x - start.x),
          height: Math.abs(pointer.y - start.y),
        });
      } else if (shape instanceof Circle) {
        const radius = Math.hypot(pointer.x - start.x, pointer.y - start.y) / 2;
        shape.set({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          radius,
        });
      } else if (shape instanceof Line) {
        shape.set({ x2: pointer.x, y2: pointer.y });
      }
      canvas.requestRenderAll();
    });

    canvas.on("mouse:up", () => {
      if (readOnly) return;
      if (panningRef.current) {
        panningRef.current = null;
        canvas.defaultCursor = toolRef.current === "move" ? "grab" : canvas.defaultCursor;
        return;
      }
      if (erasingRef.current) {
        erasingRef.current = false;
        suppressRef.current = false;
        eraserPathRef.current = null;
        eraserPointsRef.current = [];
        pushHistory();
        canvas.requestRenderAll();
        return;
      }
      const shape = drawingShapeRef.current;
      const t = toolRef.current;
      if (!shape) return;

      if (t === "arrow" && shape instanceof Line) {
        const x1 = shape.x1 ?? 0;
        const y1 = shape.y1 ?? 0;
        const x2 = shape.x2 ?? 0;
        const y2 = shape.y2 ?? 0;
        canvas.remove(shape);
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90;
        const headSize = 10 + strokeWidthRef.current * 2;
        const head = new Triangle({
          left: x2,
          top: y2,
          originX: "center",
          originY: "center",
          width: headSize,
          height: headSize,
          angle,
          fill: colorRef.current,
        });
        const line = new Line([x1, y1, x2, y2], {
          stroke: colorRef.current,
          strokeWidth: strokeWidthRef.current,
        });
        const group = new Group([line, head], { selectable: !readOnly, evented: !readOnly });
        canvas.add(group);
      } else {
        shape.set({ selectable: !readOnly, evented: !readOnly });
      }

      drawingShapeRef.current = null;
      startPointRef.current = null;
      suppressRef.current = false;
      pushHistory();
      canvas.requestRenderAll();
    });

    applyViewportScale();
    const resizeObserver = new ResizeObserver(() => applyViewportScale());
    if (wrapperRef.current) resizeObserver.observe(wrapperRef.current);

    // initialise an empty history entry
    historyRef.current = { stack: [serializeBoard(canvas)], index: 0 };
    reportHistory();

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- tool switching ----
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || readOnly) return;
    canvas.isDrawingMode = tool === "pen";
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "eraser" ? "crosshair" : tool === "select" ? "default" : "crosshair";
    canvas.upperCanvasEl.style.cursor = tool === "eraser" && !readOnly ? createEraserCursor(eraserSize) : canvas.defaultCursor;
    if (tool === "move") canvas.defaultCursor = "grab";
    const touchAction = tool === "select" ? "pan-y" : "none";
    canvas.upperCanvasEl.style.touchAction = touchAction;
    canvas.wrapperEl.style.touchAction = touchAction;
    const interaction = getCanvasObjectInteraction(tool, Boolean(readOnly));
    canvas.forEachObject((obj) => {
      obj.selectable = interaction.selectable;
      obj.evented = interaction.evented;
    });
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
    if (tool !== "select") canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [tool, color, strokeWidth, readOnly, eraserSize]);

  // ---- page switching ----
  useEffect(() => {
    // handled by imperative loadFromJSON call from parent
  }, [pageKey]);

  useImperativeHandle(
    ref,
    () => ({
      loadFromJSON: (json) => {
        const generation = ++loadGenerationRef.current;
        const task = loadQueueRef.current.then(async () => {
          if (generation !== loadGenerationRef.current) return;
          const canvas = fabricRef.current;
          if (!canvas) return;
          suppressRef.current = true;
          try {
            if (!json) {
              canvas.clear();
              canvas.backgroundColor = "#ffffff";
            } else {
              canvas.clear();
              await canvas.loadFromJSON(parseBoardSnapshot(json));
            }
            if (generation !== loadGenerationRef.current) return;
            canvas.forEachObject((obj) => {
              const interaction = getCanvasObjectInteraction(toolRef.current, Boolean(readOnly));
              obj.selectable = interaction.selectable;
              obj.evented = interaction.evented;
            });
            canvas.requestRenderAll();
            historyRef.current = { stack: [serializeBoard(canvas)], index: 0 };
            reportHistory();
          } finally {
            if (generation === loadGenerationRef.current) suppressRef.current = false;
          }
        });
        loadQueueRef.current = task.catch(() => undefined);
        return task;
      },
      exportJSON: () => (fabricRef.current ? serializeBoard(fabricRef.current) : "{}"),
      exportDataURL: () =>
        fabricRef.current?.toDataURL({ format: "png", quality: 1, multiplier: 2 }) ?? "",
      undo: () => {
        const canvas = fabricRef.current;
        const h = historyRef.current;
        if (!canvas) return;
        const nextIndex = moveCanvasHistoryIndex(h.index, h.stack.length, "undo");
        if (nextIndex === h.index) return;
        h.index = nextIndex;
        suppressRef.current = true;
        canvas.loadFromJSON(parseBoardSnapshot(h.stack[h.index])).then(() => {
          canvas.requestRenderAll();
          suppressRef.current = false;
          reportHistory();
          onContentChangeRef.current?.(h.stack[h.index]);
        });
      },
      redo: () => {
        const canvas = fabricRef.current;
        const h = historyRef.current;
        if (!canvas) return;
        const nextIndex = moveCanvasHistoryIndex(h.index, h.stack.length, "redo");
        if (nextIndex === h.index) return;
        h.index = nextIndex;
        suppressRef.current = true;
        canvas.loadFromJSON(parseBoardSnapshot(h.stack[h.index])).then(() => {
          canvas.requestRenderAll();
          suppressRef.current = false;
          reportHistory();
          onContentChangeRef.current?.(h.stack[h.index]);
        });
      },
      clearCanvas: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        suppressRef.current = true;
        canvas.clear();
        canvas.backgroundColor = "#ffffff";
        canvas.requestRenderAll();
        suppressRef.current = false;
        pushHistory();
      },
      zoomIn: () => {
        zoomRef.current = Math.min(MAX_ZOOM, zoomRef.current + 0.1);
        applyViewportScale();
        onZoomChangeRef.current?.(normalizedZoomPercent(zoomRef.current));
      },
      zoomOut: () => {
        zoomRef.current = Math.max(MIN_ZOOM, zoomRef.current - 0.1);
        applyViewportScale();
        onZoomChangeRef.current?.(normalizedZoomPercent(zoomRef.current));
      },
      fitToScreen: () => {
        zoomRef.current = 1;
        applyViewportScale();
        onZoomChangeRef.current?.(100);
      },
      setBackgroundImage: async (url) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        if (!url) {
          canvas.backgroundImage = undefined;
          canvas.requestRenderAll();
          return;
        }
        const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
        const scale = Math.min(BOARD_WIDTH / (img.width ?? BOARD_WIDTH), BOARD_HEIGHT / (img.height ?? BOARD_HEIGHT));
        img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale, selectable: false, evented: false });
        canvas.backgroundImage = img;
        canvas.requestRenderAll();
      },
      addShape: (preset, fill) => {
        const canvas = fabricRef.current;
        if (!canvas || readOnly) return;
        const center = viewportPointToScene(canvas.getWidth() / 2, canvas.getHeight() / 2, canvas.viewportTransform[0] || 1,
          canvas.viewportTransform[4], canvas.viewportTransform[5]);
        const object = createShapeObject(preset, { left: center.x - 110, top: center.y - 70, color: colorRef.current, fill, strokeWidth: strokeWidthRef.current });
        canvas.add(object);
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        pushHistory();
      },
      addTable: (rows, columns) => {
        const canvas = fabricRef.current;
        if (!canvas || readOnly) return;
        const center = viewportPointToScene(canvas.getWidth() / 2, canvas.getHeight() / 2, canvas.viewportTransform[0] || 1,
          canvas.viewportTransform[4], canvas.viewportTransform[5]);
        const table = createTableObject(rows, columns, { left: center.x - Math.min(columns, 10) * 60, top: center.y - Math.min(rows, 12) * 24, color: colorRef.current });
        canvas.add(table);
        canvas.setActiveObject(table);
        canvas.requestRenderAll();
        pushHistory();
      },
      addMathText: (value) => {
        const canvas = fabricRef.current;
        if (!canvas || readOnly) return;
        const center = viewportPointToScene(canvas.getWidth() / 2, canvas.getHeight() / 2, canvas.viewportTransform[0] || 1,
          canvas.viewportTransform[4], canvas.viewportTransform[5]);
        const text = new IText(value, { left: center.x - 40, top: center.y - 18, fontSize: 30, fill: colorRef.current });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        canvas.requestRenderAll();
        pushHistory();
      },
    }),
    [applyViewportScale, pushHistory, readOnly, reportHistory]
  );

  return (
    <div
      ref={wrapperRef}
      className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-auto bg-[#EEEEF0] p-2"
    >
      <div className="shrink-0 self-start border border-[#D9DADD] bg-white shadow-sm">
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
});
