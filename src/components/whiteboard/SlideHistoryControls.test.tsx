import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SlideHistoryControls } from "./SlideHistoryControls";

describe("slide action history controls", () => {
  it("exposes one undo and redo action for the active slide", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<div><button>Add slide</button><SlideHistoryControls canUndo canRedo onUndo={onUndo} onRedo={onRedo} /></div>);
    expect(screen.getByRole("button", { name: "Add slide" }).nextElementSibling).toBe(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Undo" }).nextElementSibling).toBe(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });
});
