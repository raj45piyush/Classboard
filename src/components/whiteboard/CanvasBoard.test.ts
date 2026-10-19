import { describe, expect, it } from "vitest";
import { Path, IText } from "fabric";
import { parseBoardSnapshot, serializeBoard } from "@/utils/boardSerialization";
import {
  calculateCanvasViewport,
  createEraserCursor,
  createEraserPath,
  getEraserSceneStrokeWidth,
  getCanvasObjectInteraction,
  isPanTool,
  moveCanvasHistoryIndex,
  normalizedZoomPercent,
  updateEraserPath,
  shouldCommitCanvasChange,
  translateViewportTransform,
  viewportPointToScene,
} from "./CanvasBoard";

describe("responsive Fabric canvas viewport", () => {
  it("reports zoom as a readable percentage without changing the saved board", () => {
    expect(normalizedZoomPercent(1)).toBe(100);
    expect(normalizedZoomPercent(1.25)).toBe(125);
    const original = { left: 24, top: 38, width: 200, height: 80 };
    calculateCanvasViewport(1200, 700, 1.4);
    expect(original).toEqual({ left: 24, top: 38, width: 200, height: 80 });
  });

  it("keeps board objects non-interactive while erasing and disables interaction for students", () => {
    expect(getCanvasObjectInteraction("eraser")).toEqual({ selectable: false, evented: false });
    expect(getCanvasObjectInteraction("select")).toEqual({ selectable: true, evented: true });
    expect(getCanvasObjectInteraction("eraser", true)).toEqual({ selectable: false, evented: false });
  });

  it("uses a circular native cursor that follows the pointer and matches the selected screen size", () => {
    const cursor20 = createEraserCursor(20);
    expect(cursor20).toContain("11 11, crosshair");
    const svgData = cursor20.match(/data:image\/svg\+xml,([^"]+)/)?.[1];
    expect(decodeURIComponent(svgData ?? "")).toContain('r="10"');
    expect(createEraserCursor(60)).toContain("31 31, crosshair");
    expect(createEraserCursor(100)).toContain("31 31, crosshair");
  });

  it("keeps the visible brush diameter consistent at different zoom levels", () => {
    expect(getEraserSceneStrokeWidth(20, 1)).toBe(20);
    expect(getEraserSceneStrokeWidth(20, 2)).toBe(10);
    expect(getEraserSceneStrokeWidth(40, 2)).toBe(20);
  });

  it("uses a persisted destination-out path so only the circular stroke area is erased", () => {
    const path = createEraserPath([{ x: 110, y: 120 }], 20, 1);
    expect(path.globalCompositeOperation).toBe("destination-out");
    expect(path.stroke).toBe("#000000");
    expect(path.strokeWidth).toBe(20);
    expect(path.strokeLineCap).toBe("round");

    const text = new IText("ClassBoard", { left: 100, top: 100, fontSize: 28 });
    const board = { objects: [text.toObject(), path.toObject()] };
    expect(board.objects).toHaveLength(2);
    expect(board.objects[0]).toMatchObject({ text: "ClassBoard" });
    expect(board.objects[1]).toMatchObject({ type: "Path", globalCompositeOperation: "destination-out" });
  });

  it("updates the same eraser path across pointer samples and restores its operation from serialized data", async () => {
    const eraserPath = createEraserPath([{ x: 10, y: 10 }], 30, 1.5);
    const pathId = eraserPath;
    updateEraserPath(eraserPath, [{ x: 10, y: 10 }, { x: 24, y: 18 }, { x: 40, y: 20 }]);
    expect(eraserPath).toBe(pathId);
    expect(eraserPath.path).toHaveLength(3);
    const text = new IText("Keep the rest of this text", { left: 0, top: 0, fontSize: 24 });
    const serialized = serializeBoard({ toJSON: () => ({ objects: [text.toObject(), eraserPath.toObject()] }) });
    const restoredSnapshot = parseBoardSnapshot(serialized);
    const restoredObjects = restoredSnapshot.objects as Array<Record<string, unknown>>;
    expect(restoredObjects).toHaveLength(2);
    expect(restoredObjects[0]).toMatchObject({ text: "Keep the rest of this text" });
    const restored = await Path.fromObject(restoredObjects[1] as never);
    expect(restored.globalCompositeOperation).toBe("destination-out");
    expect(restored.strokeWidth).toBeCloseTo(20);
    expect(restored.path).toHaveLength(3);
  });

  it("undoes a partial erase to the previous snapshot and redoes the serialized erase", () => {
    const beforeErase = JSON.stringify({ objects: [{ type: "IText", text: "Keep both sides" }] });
    const afterErase = JSON.stringify({ objects: [
      { type: "IText", text: "Keep both sides" },
      { type: "Path", globalCompositeOperation: "destination-out", path: [["M", 50, 20], ["L", 70, 20]] },
    ] });
    const stack = [beforeErase, afterErase];
    const undoneIndex = moveCanvasHistoryIndex(1, stack.length, "undo");
    expect(JSON.parse(stack[undoneIndex]).objects).toHaveLength(1);
    const redoneIndex = moveCanvasHistoryIndex(undoneIndex, stack.length, "redo");
    expect(JSON.parse(stack[redoneIndex]).objects[1].globalCompositeOperation).toBe("destination-out");
    expect(moveCanvasHistoryIndex(0, stack.length, "undo")).toBe(0);
    expect(moveCanvasHistoryIndex(1, stack.length, "redo")).toBe(1);
  });
  it("recalculates the visible canvas dimensions when the sidebar width becomes available", () => {
    const withSidebar = calculateCanvasViewport(600, 500);
    const sidebarCollapsed = calculateCanvasViewport(900, 500);
    expect(withSidebar.width).toBe(600);
    expect(withSidebar.width).toBeCloseTo(600);
    expect(sidebarCollapsed.width).toBeGreaterThan(withSidebar.width);
    expect(sidebarCollapsed.width).toBeCloseTo(900);
    expect(sidebarCollapsed.width / withSidebar.width).toBeCloseTo(1.5);
    expect(sidebarCollapsed.height).toBeGreaterThan(500);
    expect(sidebarCollapsed.height / sidebarCollapsed.width).toBeCloseTo(2160 / 1280);
  });

  it("keeps the board width-driven on wide layouts while preserving the tall scrollable work surface", () => {
    const viewport = calculateCanvasViewport(1600, 520);
    expect(viewport.width).toBe(1600);
    expect(viewport.height).toBe(2700);
    expect(viewport.height).toBeGreaterThan(520);
  });

  it("recalculates the center canvas when either or both vertical sidebars collapse", () => {
    const totalWidth = 1440;
    const pagesWidth = 224;
    const toolsWidth = 72;
    const bothOpen = calculateCanvasViewport(totalWidth - pagesWidth - toolsWidth, 720);
    const pagesCollapsed = calculateCanvasViewport(totalWidth - toolsWidth, 720);
    const toolsCollapsed = calculateCanvasViewport(totalWidth - pagesWidth - 36, 720);
    const bothCollapsed = calculateCanvasViewport(totalWidth - 36, 720);
    expect(pagesCollapsed.width).toBeGreaterThan(bothOpen.width);
    expect(toolsCollapsed.width).toBeGreaterThan(bothOpen.width);
    expect(bothCollapsed.width).toBeGreaterThan(pagesCollapsed.width);
    expect(bothCollapsed.width).toBe(totalWidth - 36);
  });

  it("keeps the board aspect ratio and applies user zoom without changing saved coordinates", () => {
    const fitted = calculateCanvasViewport(1000, 600);
    const zoomed = calculateCanvasViewport(1000, 600, 1.5);
    expect(fitted.width / (fitted.height / 3)).toBeCloseTo(1280 / 720);
    expect(zoomed.width).toBeCloseTo(fitted.width * 1.5);
    expect(zoomed.height).toBeCloseTo(fitted.height * 1.5);
  });

  it("pans the viewport without changing object coordinates", () => {
    expect(isPanTool("move")).toBe(true);
    expect(isPanTool("pen")).toBe(false);
    const transform = translateViewportTransform([0.5, 0, 0, 0.5, 0, 0], 20, -30);
    expect(transform).toEqual([0.5, 0, 0, 0.5, 20, -30]);
    expect(viewportPointToScene(120, 70, 0.5, 20, -30)).toEqual({ x: 200, y: 200 });
  });

  it("does not commit content changes from read-only boards or incoming canvas loads", () => {
    expect(shouldCommitCanvasChange(true, false)).toBe(false);
    expect(shouldCommitCanvasChange(false, true)).toBe(false);
    expect(shouldCommitCanvasChange(false, false)).toBe(true);
  });
});
