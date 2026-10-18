// Canonical whiteboard "page" size. Saved object coordinates are always
// relative to this logical size, so a lesson looks the same on every
// screen — we only scale the viewport, never the stored coordinates.
export const BOARD_WIDTH = 1280;
// Each saved slide keeps one stable, scrollable 16:9-by-3 work surface. The
// top 720 logical pixels remain the legacy slide area, so old snapshots keep
// their coordinates while teachers and students can scroll farther down.
export const BOARD_VIEW_HEIGHT = 720;
export const BOARD_HEIGHT = 2160;

export const DEFAULT_STROKE_COLOR = "#303238";
export const DEFAULT_STROKE_WIDTH = 3;

export const PALETTE = ["#303238", "#C0392B", "#2471A3", "#1E8449", "#B9770E", "#6C3483"];

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
