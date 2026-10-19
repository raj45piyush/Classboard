import { describe, expect, it } from "vitest";
import {
  calculateCanvasViewport,
  isPanTool,
  shouldCommitCanvasChange,
  translateViewportTransform,
  viewportPointToScene,
} from "./CanvasBoard";

describe("responsive Fabric canvas viewport", () => {
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
