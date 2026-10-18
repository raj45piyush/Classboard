import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageList } from "./PageList";
import type { LessonPage } from "@/types";

const pages: LessonPage[] = [{
  id: "slide-stable-1", classroomId: "class-1", lessonId: "lesson-1", title: "Introduction",
  order: 1, pageNumber: 1, pageType: "board", boardSnapshot: null, slideStoragePath: null,
  version: 0, createdAt: null, updatedAt: null, createdBy: "teacher-1", schemaVersion: 1, savedAt: null,
}];

describe("Pages sidebar controls", () => {
  it("collapses without selecting a different slide and retains slide metadata", () => {
    const onCollapse = vi.fn();
    const onSelect = vi.fn();
    render(<PageList pages={pages} activePageId="slide-stable-1" onSelect={onSelect} onAdd={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onCollapse={onCollapse} />);
    expect(screen.getByText("Slide ID: slide-stable-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Pages sidebar" }));
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("restores the same selected page from parent-controlled selection", () => {
    const { rerender } = render(<PageList pages={pages} activePageId="slide-stable-1" onSelect={vi.fn()} onAdd={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onCollapse={vi.fn()} />);
    rerender(<PageList pages={pages} activePageId="slide-stable-1" onSelect={vi.fn()} onAdd={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onCollapse={vi.fn()} />);
    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Slide ID: slide-stable-1")).toBeInTheDocument();
  });

  it("offers an accessible add-slide action and disables it while creation is running", () => {
    const onAdd = vi.fn();
    const { rerender } = render(<PageList pages={pages} activePageId="slide-stable-1" onSelect={vi.fn()} onAdd={onAdd} onDuplicate={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onCollapse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add new slide" }));
    expect(onAdd).toHaveBeenCalledOnce();
    rerender(<PageList pages={pages} activePageId="slide-stable-1" onSelect={vi.fn()} onAdd={onAdd} onDuplicate={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onCollapse={vi.fn()} addingPage />);
    expect(screen.getByRole("button", { name: "Add new slide" })).toBeDisabled();
  });
});
