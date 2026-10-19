import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardDetailsPanel } from "./BoardDetailsPanel";
import type { LessonPage } from "@/types";

const page: LessonPage = {
  id: "stable-slide-id",
  classroomId: "classroom-1",
  lessonId: "lesson-1",
  title: "Fractions",
  order: 2,
  pageNumber: 2,
  pageType: "board",
  boardSnapshot: null,
  slideStoragePath: null,
  version: 0,
  createdAt: null,
  updatedAt: null,
  createdBy: "teacher-1",
  schemaVersion: 1,
  savedAt: null,
};

describe("right board details sidebar", () => {
  it("shows details and provides a collapse control without changing the selected slide", () => {
    const onToggle = vi.fn();
    render(<BoardDetailsPanel collapsed={false} onToggle={onToggle} page={page} pageNumber={2} pageCount={4} saveState="saved" />);
    expect(screen.getByText("Slide ID")).toBeInTheDocument();
    expect(screen.getByText("stable-slide-id")).toBeInTheDocument();
    expect(screen.getByText("2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse right sidebar" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("keeps an accessible restore toggle visible while collapsed", () => {
    const onToggle = vi.fn();
    const { container } = render(<BoardDetailsPanel collapsed onToggle={onToggle} page={page} pageNumber={2} pageCount={4} saveState="saving" />);
    expect(screen.getByRole("button", { name: "Expand right sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("stable-slide-id")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="board-details-sidebar"]')).toHaveClass("transition-[width]");
    fireEvent.click(screen.getByRole("button", { name: "Expand right sidebar" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
