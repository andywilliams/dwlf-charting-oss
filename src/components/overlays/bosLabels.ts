import type { BosLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestIndex } from './annotationUtils';
import { intersects, type PixelRect } from './zoneRects';

/**
 * Where a BOS line's type label goes: its drawn geometry, the box each placement occupies, and the
 * resolution of `auto` against the boxes to avoid. Shared by BosLineAnnotationView (which draws from
 * it) and AnnotationLayer (which resolves every auto label on a pane in one pass).
 */

/** A BOS label's resolved place (`auto` worked out). */
export type BosLabelPlacement = Exclude<NonNullable<BosLineAnnotation['labelPlacement']>, 'auto'>;
type Placement = BosLabelPlacement;
/**
 * A segment tries its break end first, then its swing end, then beside either end; a full-width line
 * only its left end (its right end is the price badge's).
 */
const AUTO_ORDER: Record<'segment' | 'line', readonly Placement[]> = {
  segment: ['end-above', 'end-below', 'start-above', 'start-below', 'start-beside', 'end-beside'],
  line: ['start-above', 'start-below', 'start-beside'],
};
/** The label's box around its anchor: 10px bold text, about 6.5px a character, plus a little air. */
const LABEL_HEIGHT = 12;
/** Beside an end the text is centred on the line, so its box is the 10px em box, no baseline air. */
const BESIDE_HEIGHT = 10;
const labelWidth = (text: string) => text.length * 6.5 + 4;

/**
 * Where the <text> is drawn for a placement, and the box it occupies: one source for both, so the box
 * the collision check uses is the one the label is drawn in. Inside an end the label reads inward
 * along the line (above it on the baseline, below it hanging); beside an end it reads outward, centred
 * on the line.
 */
export function labelLayout(placement: Placement, text: string, y: number, startX: number, endX: number, besideEndGap = 0) {
  const w = labelWidth(text);
  const atEnd = placement.startsWith('end');
  if (placement.endsWith('beside')) {
    // Beside the break end, past the price badge when one is drawn there (besideEndGap: its width and air).
    const x = atEnd ? endX + 6 + besideEndGap : startX - 6;
    const left = atEnd ? x : x - w;
    return {
      x, y, anchor: (atEnd ? 'start' : 'end') as 'start' | 'end', baseline: 'central' as const,
      box: { left, right: left + w, top: y - BESIDE_HEIGHT / 2, bottom: y + BESIDE_HEIGHT / 2 },
    };
  }
  const below = placement.endsWith('below');
  const x = atEnd ? endX - 4 : startX + 4;
  const left = atEnd ? x - w : x;
  const top = below ? y + 3 : y - 3 - LABEL_HEIGHT;
  return {
    x, y: below ? y + 5 : y - 5, anchor: (atEnd ? 'end' : 'start') as 'start' | 'end', baseline: below ? ('hanging' as const) : undefined,
    box: { left, right: left + w, top, bottom: top + LABEL_HEIGHT },
  };
}

/** The label box for a placement, in pixels: the box `labelLayout` draws the label in. */
export const labelBox = (placement: Placement, text: string, y: number, startX: number, endX: number, besideEndGap = 0): PixelRect =>
  labelLayout(placement, text, y, startX, endX, besideEndGap).box;

/**
 * The first placement whose label box lies inside the pane and is clear of every box to avoid (the
 * zones, and the line's own price badge when drawn); else the first inside the pane; else the line's
 * default (end-above for a segment, start-above for a full-width line).
 */
export function autoPlacement(
  text: string,
  y: number,
  startX: number,
  endX: number,
  avoid: readonly PixelRect[],
  pane: { width: number; height: number },
  segment: boolean,
  besideEndGap = 0,
): Placement {
  const order = AUTO_ORDER[segment ? 'segment' : 'line'];
  const fits = (p: Placement) => {
    const b = labelBox(p, text, y, startX, endX, besideEndGap);
    return b.left >= 0 && b.right <= pane.width && b.top >= 0 && b.bottom <= pane.height;
  };
  const clear = (p: Placement) => !avoid.some((r) => intersects(labelBox(p, text, y, startX, endX, besideEndGap), r));
  // Clear and on the pane; else at least on the pane (over a zone, the halo keeps it readable); else the default.
  return order.find((p) => fits(p) && clear(p)) ?? order.find(fits) ?? order[0];
}

/** What turns a BOS line's times and price into pane pixels, as the view receives it. */
export interface BosGeometryContext {
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  timeToIndex?: (time: number) => number | undefined;
  compressedTimes?: number[];
}

/**
 * A BOS line's drawn geometry: its y, its ends (a bounded segment from `startTime` to the break, or a
 * full-width line from the break), its label text, its price badge's box and how far past the badge a
 * label beside the break end goes. One source for the view and the layer's label resolution.
 */
export function bosGeometry(annotation: BosLineAnnotation, ctx: BosGeometryContext) {
  const y = ctx.yScale.scale(annotation.price);
  const resolveX = (t: number): number | null => {
    const xv = findClosestIndex(t, ctx.compressedTimes, ctx.timeToIndex);
    const px = xv !== undefined ? ctx.xScale(xv) : ctx.xScale(t);
    return Number.isFinite(px) ? px : null;
  };
  const breakX = resolveX(annotation.time) ?? 0;
  const startXOpt = annotation.startTime != null ? resolveX(annotation.startTime) : null;
  const hasSegment = startXOpt !== null;
  const lineStartX = hasSegment ? (startXOpt as number) : breakX;
  const lineEndX = hasSegment ? breakX : ctx.chartWidth;
  const priceLabelWidth = Math.max(50, annotation.price.toFixed(2).length * 7 + 16);
  const badgeLeft = hasSegment ? breakX + 6 : ctx.chartWidth - priceLabelWidth - 8;
  const priceBadge: PixelRect = { left: badgeLeft, right: badgeLeft + priceLabelWidth, top: y - 10, bottom: y + 10 };
  // Beside a segment's break, the label goes past the price badge when one is drawn there (measured from the badge as drawn).
  const besideEndGap = annotation.showPrice && hasSegment ? priceBadge.right + 4 - (lineEndX + 6) : 0;
  const text = annotation.label ?? (annotation.bosType === 'ChoCH' ? 'ChoCH' : 'BOS');
  return { y, lineStartX, lineEndX, hasSegment, priceBadge, besideEndGap, text };
}
export type BosGeometry = ReturnType<typeof bosGeometry>;

/**
 * The placement a line's label is drawn at: its fixed one, or for `auto` the first clear of `avoid`
 * (and of its own price badge when drawn). A full-width line's right end is the chart's edge (and its
 * badge's), so `end-beside` there is drawn as `start-beside`.
 */
export function placementFor(annotation: BosLineAnnotation, g: BosGeometry, avoid: readonly PixelRect[], pane: { width: number; height: number }): Placement {
  const requested = annotation.labelPlacement ?? (g.hasSegment ? 'end-above' : 'start-above');
  const asked = requested === 'end-beside' && !g.hasSegment ? 'start-beside' : requested;
  if (asked !== 'auto') return asked;
  return autoPlacement(g.text, g.y, g.lineStartX, g.lineEndX, annotation.showPrice ? [...avoid, g.priceBadge] : avoid, pane, g.hasSegment, g.besideEndGap);
}

/** A BOS line's own drawn segment as a thin box, so another line's label keeps off it. */
export const bosLineRect = (g: BosGeometry): PixelRect => ({ left: g.lineStartX, right: g.lineEndX, top: g.y - 2, bottom: g.y + 2 });

/**
 * Every `auto` BOS label on a pane, placed in order (the first annotation gets first choice): each
 * keeps clear of the zones, of every other BOS line and its price badge, of every fixed label (placed
 * first, wherever listed, since it cannot move) and of the auto labels already placed. Returns the
 * placement by annotation id; a line whose label is hidden or fixed is not in it.
 */
export function resolveBosLabels(
  lines: readonly BosLineAnnotation[],
  ctx: BosGeometryContext,
  zones: readonly PixelRect[],
  pane: { width: number; height: number },
): Map<string, Placement> {
  const geometries = lines.map((a) => ({ a, g: bosGeometry(a, ctx) })).filter(({ g }) => Number.isFinite(g.y));
  const isAuto = (a: BosLineAnnotation) => (a.labelPlacement ?? 'end-above') === 'auto';
  // A fixed label cannot move, so it is placed before any auto one, wherever it is listed.
  const fixed = geometries
    .filter(({ a }) => a.showLabel && !isAuto(a))
    .map(({ a, g }) => labelLayout(placementFor(a, g, [], pane), g.text, g.y, g.lineStartX, g.lineEndX, g.besideEndGap).box);
  // Every other line's segment and price badge (when drawn) is an obstacle to a label.
  const obstacles = (id: string) => geometries.filter((o) => o.a.id !== id).flatMap((o) => (o.a.showPrice ? [bosLineRect(o.g), o.g.priceBadge] : [bosLineRect(o.g)]));
  const out = new Map<string, Placement>();
  const placed: PixelRect[] = [...fixed];
  for (const { a, g } of geometries) {
    if (!a.showLabel || !isAuto(a)) continue;
    const placement = placementFor(a, g, [...zones, ...obstacles(a.id), ...placed], pane);
    out.set(a.id, placement);
    placed.push(labelLayout(placement, g.text, g.y, g.lineStartX, g.lineEndX, g.besideEndGap).box);
  }
  return out;
}

