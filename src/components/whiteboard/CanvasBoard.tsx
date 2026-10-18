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

export type ToolName = "select" | "pen" | "eraser" | "text" | "line" | "rect" | "circle" | "arrow";

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
}

const HISTORY_LIMIT = 60;

export function calculateCanvasViewport(containerWidth: number, containerHeight: number, zoom = 1) {
  const fitScale = Math.min(containerWidth / BOARD_WIDTH, containerHeight / BOARD_HEIGHT);
  const scale = fitScale * zoom;
  return { scale, width: BOARD_WIDTH * scale, height: BOARD_HEIGHT * scale };
}

export const CanvasBoard = forwardRef<CanvasBoardHandle, CanvasBoardProps>(function CanvasBoard(
  { tool, color, strokeWidth, readOnly, pageKey, onContentChange, onHistoryChange, onToolConsumed },
  ref
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const toolRef = useRef<ToolName>(tool);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const suppressRef = useRef(false);
  const drawingShapeRef = useRef<FabricObject | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const erasingRef = useRef(false);
  const zoomRef = useRef(1);

  toolRef.current = tool;
  colorRef.current = color;
  strokeWidthRef.current = strokeWidth;

  const reportHistory = useCallback(() => {
    const { stack, index } = historyRef.current;
    onHistoryChange?.({ canUndo: index > 0, canRedo: index < stack.length - 1 });
  }, [onHistoryChange]);

  const pushHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || suppressRef.current) return;
    const json = serializeBoard(canvas);
    const h = historyRef.current;
    if (h.index >= 0 && h.stack[h.index] === json) return;
    const next = h.stack.slice(0, h.index + 1);
    next.push(json);
    if (next.length > HISTORY_LIMIT) next.shift();
    historyRef.current = { stack: next, index: next.length - 1 };
    reportHistory();
    onContentChange?.(json);
  }, [onContentChange, reportHistory]);

  const applyViewportScale = useCallback(() => {
    const canvas = fabricRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const containerWidth = wrapper.clientWidth;
    const containerHeight = wrapper.clientHeight;
    const dimensions = calculateCanvasViewport(containerWidth, containerHeight, zoomRef.current);
    canvas.setDimensions({ width: dimensions.width, height: dimensions.height });
    const scale = dimensions.scale;
    canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);
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
        onToolConsumed?.();
        return;
      }

      if (t === "eraser") {
        erasingRef.current = true;
        const target = canvas.findTarget(opt.e).target;
        if (target) {
          canvas.remove(target);
        }
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
      const pointer = canvas.getScenePoint(opt.e);

      if (t === "eraser" && erasingRef.current) {
        const target = canvas.findTarget(opt.e).target;
        if (target) canvas.remove(target);
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
      if (erasingRef.current) {
        erasingRef.current = false;
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
    canvas.forEachObject((obj) => {
      obj.selectable = tool === "select";
      obj.evented = tool === "select";
    });
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
    if (tool !== "select") canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [tool, color, strokeWidth, readOnly]);

  // ---- page switching ----
  useEffect(() => {
    // handled by imperative loadFromJSON call from parent
  }, [pageKey]);

  useImperativeHandle(
    ref,
    () => ({
      loadFromJSON: (json) =>
        new Promise<void>((resolve, reject) => {
          const canvas = fabricRef.current;
          if (!canvas) return resolve();
          suppressRef.current = true;
          const finish = () => {
            canvas.forEachObject((obj) => {
              obj.selectable = !readOnly && toolRef.current === "select";
              obj.evented = !readOnly && toolRef.current === "select";
            });
            canvas.requestRenderAll();
            historyRef.current = { stack: [serializeBoard(canvas)], index: 0 };
            reportHistory();
            suppressRef.current = false;
            resolve();
          };
          if (!json) {
            canvas.clear();
            canvas.backgroundColor = "#ffffff";
            finish();
            return;
          }
          try {
            const parsed = parseBoardSnapshot(json);
            canvas.loadFromJSON(parsed).then(finish).catch((error) => {
              suppressRef.current = false;
              reject(error);
            });
          } catch (error) {
            suppressRef.current = false;
            reject(error);
          }
        }),
      exportJSON: () => (fabricRef.current ? serializeBoard(fabricRef.current) : "{}"),
      exportDataURL: () =>
        fabricRef.current?.toDataURL({ format: "png", quality: 1, multiplier: 2 }) ?? "",
      undo: () => {
        const canvas = fabricRef.current;
        const h = historyRef.current;
        if (!canvas || h.index <= 0) return;
        h.index -= 1;
        suppressRef.current = true;
        canvas.loadFromJSON(parseBoardSnapshot(h.stack[h.index])).then(() => {
          canvas.requestRenderAll();
          suppressRef.current = false;
          reportHistory();
          onContentChange?.(h.stack[h.index]);
        });
      },
      redo: () => {
        const canvas = fabricRef.current;
        const h = historyRef.current;
        if (!canvas || h.index >= h.stack.length - 1) return;
        h.index += 1;
        suppressRef.current = true;
        canvas.loadFromJSON(parseBoardSnapshot(h.stack[h.index])).then(() => {
          canvas.requestRenderAll();
          suppressRef.current = false;
          reportHistory();
          onContentChange?.(h.stack[h.index]);
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
      },
      zoomOut: () => {
        zoomRef.current = Math.max(MIN_ZOOM, zoomRef.current - 0.1);
        applyViewportScale();
      },
      fitToScreen: () => {
        zoomRef.current = 1;
        applyViewportScale();
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
    }),
    [applyViewportScale, onContentChange, pushHistory, readOnly, reportHistory]
  );

  return (
    <div
      ref={wrapperRef}
      className="flex h-full w-full items-center justify-center overflow-auto bg-[#EEEEF0] p-3"
    >
      <div className="border border-[#D9DADD] bg-white shadow-sm">
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
});
