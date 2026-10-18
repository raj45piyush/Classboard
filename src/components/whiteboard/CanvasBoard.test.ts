import { describe, expect, it } from "vitest";
import { calculateCanvasViewport } from "./CanvasBoard";

describe("responsive Fabric canvas viewport", () => {
  it("recalculates the visible canvas dimensions when the sidebar width becomes available", () => {
    const withSidebar = calculateCanvasViewport(600, 500);
    const sidebarCollapsed = calculateCanvasViewport(900, 500);
    expect(withSidebar.width).toBe(600);
    expect(sidebarCollapsed.width).toBeGreaterThan(withSidebar.width);
    expect(sidebarCollapsed.height).toBe(500);
  });

  it("keeps the board aspect ratio and applies user zoom without changing saved coordinates", () => {
    const fitted = calculateCanvasViewport(1000, 600);
    const zoomed = calculateCanvasViewport(1000, 600, 1.5);
    expect(fitted.width / fitted.height).toBeCloseTo(1280 / 720);
    expect(zoomed.width).toBeCloseTo(fitted.width * 1.5);
    expect(zoomed.height).toBeCloseTo(fitted.height * 1.5);
  });
});
