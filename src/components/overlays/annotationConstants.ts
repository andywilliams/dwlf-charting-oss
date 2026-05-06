export const LINE_STYLE_MAP: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 4',
};

// === Handle & Hit Area Sizes ===
// Centralized constants for annotation interaction targets.
// Larger values = easier to grab, especially on touch devices.

/** Radius for circular endpoint handles (e.g., trendline endpoints) */
export const HANDLE_RADIUS = 16;

/** Radius for smaller secondary handles (e.g., midpoint drag) */
export const HANDLE_RADIUS_SMALL = 12;

/** Size for square corner handles (e.g., rectangle corners) */
export const CORNER_SIZE = 18;

/** Width of invisible hit area for line-based annotations */
export const HIT_AREA_WIDTH = 44;

/** Padding around rectangular annotations for easier click target */
export const RECT_HIT_PADDING = 12;

/** Size of rectangular drag handles (e.g., HLine drag grip) */
export const DRAG_HANDLE_SIZE = 24;

/** Offset from edge where drag handles are positioned */
export const HANDLE_EDGE_OFFSET = 4;

/**
 * Indicator line positioning - derived from DRAG_HANDLE_SIZE for consistency.
 * Lines span the middle 50% of the handle for a clean centered appearance.
 */
export const INDICATOR_LINE_START = HANDLE_EDGE_OFFSET + DRAG_HANDLE_SIZE / 4;
export const INDICATOR_LINE_END = HANDLE_EDGE_OFFSET + (DRAG_HANDLE_SIZE * 3) / 4;
