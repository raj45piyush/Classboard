import { describe, expect, it } from "vitest";
import { initialWhiteboardLayout, whiteboardLayoutReducer } from "./whiteboardLayout";

describe("whiteboard workspace layout", () => {
  it("collapses and restores Pages without changing the selected page state", () => {
    const selectedPageId = "slide-stable-1";
    const collapsed = whiteboardLayoutReducer(initialWhiteboardLayout, { type: "toggle-pages" });
    const restored = whiteboardLayoutReducer(collapsed, { type: "toggle-pages" });
    expect(collapsed.pagesCollapsed).toBe(true);
    expect(restored.pagesCollapsed).toBe(false);
    expect(selectedPageId).toBe("slide-stable-1");
  });

  it("maximizes and restores while preserving the previous sidebar state", () => {
    const collapsed = whiteboardLayoutReducer(initialWhiteboardLayout, { type: "toggle-pages" });
    const maximized = whiteboardLayoutReducer(collapsed, { type: "toggle-maximized" });
    const restored = whiteboardLayoutReducer(maximized, { type: "restore" });
    expect(maximized).toEqual({ pagesCollapsed: true, detailsSidebarCollapsed: false, classroomToolbarHidden: false, mainToolbarHidden: false, maximized: true });
    expect(restored).toEqual({ pagesCollapsed: true, detailsSidebarCollapsed: false, classroomToolbarHidden: false, mainToolbarHidden: false, maximized: false });
  });

  it("leaves the sidebar state untouched when maximize is toggled repeatedly", () => {
    const collapsed = { ...initialWhiteboardLayout, pagesCollapsed: true };
    expect(whiteboardLayoutReducer(collapsed, { type: "toggle-maximized" }).pagesCollapsed).toBe(true);
  });

  it("collapses and restores the right sidebar independently from Pages", () => {
    const pagesHidden = whiteboardLayoutReducer(initialWhiteboardLayout, { type: "toggle-pages" });
    const rightHidden = whiteboardLayoutReducer(pagesHidden, { type: "toggle-details-sidebar" });
    expect(rightHidden).toMatchObject({ pagesCollapsed: true, detailsSidebarCollapsed: true });
    const pagesRestored = whiteboardLayoutReducer(rightHidden, { type: "toggle-pages" });
    expect(pagesRestored).toMatchObject({ pagesCollapsed: false, detailsSidebarCollapsed: true });
    const rightRestored = whiteboardLayoutReducer(pagesRestored, { type: "toggle-details-sidebar" });
    expect(rightRestored).toMatchObject({ pagesCollapsed: false, detailsSidebarCollapsed: false });
  });

  it("toggles the classroom toolbar independently of Pages and maximize state", () => {
    const pagesHidden = whiteboardLayoutReducer(initialWhiteboardLayout, { type: "toggle-pages" });
    const toolbarHidden = whiteboardLayoutReducer(pagesHidden, { type: "toggle-classroom-toolbar" });
    expect(toolbarHidden).toMatchObject({ pagesCollapsed: true, classroomToolbarHidden: true, maximized: false });
    const maximized = whiteboardLayoutReducer(toolbarHidden, { type: "toggle-maximized" });
    expect(maximized).toMatchObject({ pagesCollapsed: true, classroomToolbarHidden: true, maximized: true });
    const toolbarRestored = whiteboardLayoutReducer(maximized, { type: "toggle-classroom-toolbar" });
    expect(toolbarRestored).toMatchObject({ pagesCollapsed: true, classroomToolbarHidden: false, maximized: true });
  });

  it("hides and restores the main action toolbar independently while preserving workspace and operation state", () => {
    const state = {
      ...initialWhiteboardLayout,
      pagesCollapsed: true,
      classroomToolbarHidden: true,
      maximized: true,
      sharing: true,
      publishing: false,
      uploading: true,
      selectedSlideId: "stable-slide-3",
    };
    const hidden = whiteboardLayoutReducer(state, { type: "toggle-main-toolbar" });
    expect(hidden).toMatchObject({
      pagesCollapsed: true,
      classroomToolbarHidden: true,
      mainToolbarHidden: true,
      maximized: true,
      sharing: true,
      publishing: false,
      uploading: true,
      selectedSlideId: "stable-slide-3",
    });
    const restored = whiteboardLayoutReducer(hidden, { type: "toggle-main-toolbar" });
    expect(restored).toMatchObject({
      pagesCollapsed: true,
      classroomToolbarHidden: true,
      mainToolbarHidden: false,
      maximized: true,
      sharing: true,
      publishing: false,
      uploading: true,
      selectedSlideId: "stable-slide-3",
    });
  });
});
