import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolsPanel } from "./ToolsPanel";

describe("right whiteboard tools panel", () => {
  it("collapses to an edge toggle and restores its vertical controls", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ToolsPanel collapsed={false} onToggle={onToggle}><button>Pen</button></ToolsPanel>);
    const panel = screen.getByTestId("whiteboard-tools-sidebar");
    expect(panel).toHaveClass("w-[4.5rem]");
    expect(screen.getByRole("button", { name: "Pen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse tools sidebar" }));
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<ToolsPanel collapsed onToggle={onToggle}><button>Pen</button></ToolsPanel>);
    expect(panel).toHaveClass("w-9", "transition-[width]");
    expect(screen.queryByRole("button", { name: "Pen" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand tools sidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
