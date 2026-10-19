export interface WhiteboardLayoutState {
  pagesCollapsed: boolean;
  classroomToolbarHidden: boolean;
  mainToolbarHidden: boolean;
  maximized: boolean;
}

export type WhiteboardLayoutAction =
  | { type: "toggle-pages" }
  | { type: "toggle-classroom-toolbar" }
  | { type: "toggle-main-toolbar" }
  | { type: "toggle-maximized" }
  | { type: "restore" };

export const initialWhiteboardLayout: WhiteboardLayoutState = {
  pagesCollapsed: false,
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
