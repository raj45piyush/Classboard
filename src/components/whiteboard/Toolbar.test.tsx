import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";

function renderToolbar(tool: "select" | "eraser" = "select") {
  const handlers = {
    onToolChange: vi.fn(), onColorChange: vi.fn(), onStrokeWidthChange: vi.fn(),
    onEraserSizeChange: vi.fn(),
    onClear: vi.fn(), onZoomIn: vi.fn(),
    onZoomOut: vi.fn(), onFitToScreen: vi.fn(), onAddShape: vi.fn(),
    onAddTable: vi.fn(), onAddMathText: vi.fn(),
  };
  const result = render(<Toolbar
    orientation="vertical" tool={tool} color="#303238" strokeWidth={3} eraserSize={20} zoomPercent={125}
    onToolChange={handlers.onToolChange} onColorChange={handlers.onColorChange}
    onStrokeWidthChange={handlers.onStrokeWidthChange} onEraserSizeChange={handlers.onEraserSizeChange}
    onClear={handlers.onClear} onZoomIn={handlers.onZoomIn} onZoomOut={handlers.onZoomOut}
    onFitToScreen={handlers.onFitToScreen} onAddShape={handlers.onAddShape}
    onAddTable={handlers.onAddTable} onAddMathText={handlers.onAddMathText}
  />);
  return { ...result, handlers };
}

describe("compact whiteboard drawing toolbar", () => {
  it("renders one primary set of drawing controls and preserves tool selection", () => {
    const { handlers } = renderToolbar();
    expect(screen.getByRole("toolbar", { name: "Whiteboard tools" })).toHaveAttribute("aria-orientation", "vertical");
    for (const label of ["Select", "Pen", "Move", "Eraser", "Text", "Line", "Rectangle", "Circle", "Arrow", "Mathematical shapes", "Insert table", "Math symbols"]) {
      expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    }
    expect(screen.getByLabelText("Custom colour")).toBeInTheDocument();
    expect(screen.getByLabelText("Thickness")).toBeInTheDocument();
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pen" }));
    expect(handlers.onToolChange).toHaveBeenCalledWith("pen");
  });

  it("opens the existing shape, table, and symbol tools without duplicating the toolbar", () => {
    const { handlers } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Mathematical shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Hexagon" }));
    expect(handlers.onAddShape).toHaveBeenCalledWith("hexagon", "transparent");

    fireEvent.click(screen.getByRole("button", { name: "Insert table" }));
    fireEvent.change(screen.getByLabelText("Table rows"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Table columns"), { target: { value: "2" } });
    fireEvent.click(within(screen.getByRole("form", { name: "Insert table" })).getByRole("button", { name: "Insert table" }));
    expect(handlers.onAddTable).toHaveBeenCalledWith(4, 2);

    fireEvent.click(screen.getByRole("button", { name: "Math symbols" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert π" }));
    expect(handlers.onAddMathText).toHaveBeenCalledWith("π");
  });

  it("shows a real brush-size control when Eraser is active", () => {
    const { handlers } = renderToolbar("eraser");
    expect(screen.getByText("Eraser 20px")).toBeInTheDocument();
    const size = screen.getByLabelText("Eraser 20px");
    expect(size).toHaveAttribute("type", "range");
    fireEvent.change(size, { target: { value: "40" } });
    expect(handlers.onEraserSizeChange).toHaveBeenCalledWith(40);
  });
});
