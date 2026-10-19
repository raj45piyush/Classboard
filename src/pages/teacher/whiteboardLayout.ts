export interface WhiteboardLayoutState {
  pagesCollapsed: boolean;
  toolsCollapsed: boolean;
  classroomToolbarHidden: boolean;
  mainToolbarHidden: boolean;
  maximized: boolean;
}

export type WhiteboardLayoutAction =
  | { type: "toggle-pages" }
  | { type: "toggle-tools" }
  | { type: "toggle-classroom-toolbar" }
  | { type: "toggle-main-toolbar" }
  | { type: "toggle-maximized" }
  | { type: "restore" };

export const initialWhiteboardLayout: WhiteboardLayoutState = {
  pagesCollapsed: false,
  toolsCollapsed: false,
  classroomToolbarHidden: false,
  mainToolbarHidden: false,
  maximized: false,
};

export function whiteboardLayoutReducer(
  state: WhiteboardLayoutState,
  action: WhiteboardLayoutAction
): WhiteboardLayoutState {
  switch (action.type) {
    case "toggle-pages":
      return { ...state, pagesCollapsed: !state.pagesCollapsed };
    case "toggle-tools":
      return { ...state, toolsCollapsed: !state.toolsCollapsed };
    case "toggle-classroom-toolbar":
      return { ...state, classroomToolbarHidden: !state.classroomToolbarHidden };
    case "toggle-main-toolbar":
      return { ...state, mainToolbarHidden: !state.mainToolbarHidden };
    case "toggle-maximized":
      return { ...state, maximized: !state.maximized };
    case "restore":
      return { ...state, maximized: false };
  }
}
