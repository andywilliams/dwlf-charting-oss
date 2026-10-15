/**
 * Pointer or swipe travel per bar moved, in bar widths. Above one so that a small accidental move
 * does not shift the chart; drag and wheel share the one factor.
 */
export const PAN_TRAVEL_PER_BAR = 1.5;

/** Pixels in one line of a line-mode wheel event (`deltaMode` 1, e.g. Firefox with a mouse wheel). */
const LINE_PX = 16;

/** Whole bars that `px` of travel moves, rounded the same way in both directions. */
export function barsForPixels(px: number, pxPerBar: number): number {
  const bars = Math.round(Math.abs(px) / (pxPerBar * PAN_TRAVEL_PER_BAR));
  return bars === 0 ? 0 : Math.sign(px) * bars;
}

export interface WheelPanInput {
  start: number;
  /** Travel left over from earlier events that has not yet moved a whole bar. */
  carryPx: number;
  deltaX: number;
  deltaMode: number;
  pxPerBar: number;
  /** Width of the plot, for page-mode events (`deltaMode` 2). */
  pageWidthPx: number;
}

/**
 * Where a horizontal wheel or trackpad swipe moves the window. A wheel's deltaX is a scroll offset
 * (positive scrolls right), the opposite sign to a drag's pointer travel, so a positive deltaX moves
 * toward newer bars and the candles follow the fingers as they do in a drag. Travel short of a bar
 * is carried to the next event, so a slow swipe of many small events still pans.
 */
export function wheelPanStep({ start, carryPx, deltaX, deltaMode, pxPerBar, pageWidthPx }: WheelPanInput): {
  start: number;
  carryPx: number;
} {
  // No plot width or no bars visible: nothing to step by, and nothing worth carrying.
  if (!(pxPerBar > 0) || !Number.isFinite(pxPerBar)) return { start, carryPx: 0 };
  const px = deltaX * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? pageWidthPx : 1);
  const total = carryPx + px;
  const bars = barsForPixels(total, pxPerBar);
  return { start: start + bars, carryPx: total - bars * pxPerBar * PAN_TRAVEL_PER_BAR };
}
