import type { FairValueGapAnnotation, OrderBlockAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestIndex } from './annotationUtils';

/** A box in pane pixels. */
export interface PixelRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** What turns a zone's times and prices into pane pixels, as the zone views receive it. */
export interface ZoneGeometryContext {
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  timeToIndex?: (time: number) => number | undefined;
  indexToTime?: (index: number) => number;
  dataLength?: number;
  compressedTimes?: number[];
}

/** A time's x value: the closest bar index in compressGaps mode, else undefined (the raw time is used). */
function xValueOf(time: number, ctx: ZoneGeometryContext): number | undefined {
  if (ctx.timeToIndex && ctx.indexToTime && (ctx.dataLength ?? 0) > 0) return findClosestIndex(time, ctx.compressedTimes, ctx.timeToIndex);
  if (ctx.timeToIndex) return ctx.timeToIndex(time);
  return undefined;
}

/**
 * An order block's drawn box: from just before its candle to its `endTime` (clamped to the right
 * edge), or the legacy narrow box without one. Null when it cannot be placed.
 */
export function orderBlockRect(annotation: OrderBlockAnnotation, ctx: ZoneGeometryContext): PixelRect | null {
  const x = ctx.xScale(xValueOf(annotation.time, ctx) ?? annotation.time);
  const yHigh = ctx.yScale.scale(annotation.high);
  const yLow = ctx.yScale.scale(annotation.low);
  if ([x, yHigh, yLow].some((v) => !Number.isFinite(v))) return null;
  const left = x - 20;
  let right = x + 20;
  if (annotation.endTime != null) {
    const endX = ctx.xScale(xValueOf(annotation.endTime, ctx) ?? annotation.endTime);
    if (Number.isFinite(endX)) right = Math.max(left + 6, Math.min(endX, ctx.chartWidth));
  }
  return { left, right, top: Math.min(yHigh, yLow), bottom: Math.max(yHigh, yLow) };
}

/** A fair value gap's drawn box, between its two times and its top and bottom. Null when it cannot be placed. */
export function fairValueGapRect(annotation: FairValueGapAnnotation, ctx: ZoneGeometryContext): PixelRect | null {
  const xValue1 = xValueOf(annotation.time1, ctx) ?? annotation.time1;
  const xValue2 = xValueOf(annotation.time2, ctx) ?? annotation.time2;
  if (!Number.isFinite(xValue1) || !Number.isFinite(xValue2)) return null;
  const x1 = ctx.xScale(xValue1);
  const x2 = ctx.xScale(xValue2);
  const yTop = ctx.yScale.scale(annotation.top);
  const yBottom = ctx.yScale.scale(annotation.bottom);
  if ([x1, x2, yTop, yBottom].some((v) => !Number.isFinite(v))) return null;
  return { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(yTop, yBottom), bottom: Math.max(yTop, yBottom) };
}

/** Whether two boxes overlap. */
export const intersects = (a: PixelRect, b: PixelRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
