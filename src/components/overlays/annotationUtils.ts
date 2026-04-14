import type { LineStyle, XScale } from '../../charting/types';
import { findClosestTime, resolveFractionalIndex } from '../../charting/scales';

/** Maps LineStyle values to SVG stroke-dasharray patterns */
export const LINE_STYLE_MAP: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 4',
};

export const findClosestIndex = (
  time: number,
  times: number[] | undefined,
  timeToIndex: ((t: number) => number | undefined) | undefined,
): number | undefined => {
  if (!timeToIndex) return undefined;
  const exact = timeToIndex(time);
  if (exact !== undefined) return exact;
  if (!times || !times.length) return undefined;
  const closestTime = findClosestTime(times, time);
  if (!Number.isFinite(closestTime)) return undefined;
  return timeToIndex(closestTime);
};

/**
 * Resolve a time value to an x-pixel coordinate, handling compressGaps mode.
 */
export const resolveX = (
  time: number,
  xScale: XScale,
  timeToIndex: ((t: number) => number | undefined) | undefined,
  indexToTime: ((i: number) => number) | undefined,
  dataLength: number,
  compressedTimes: number[] | undefined,
): number | undefined => {
  let indexValue: number | undefined;
  if (timeToIndex && indexToTime && dataLength > 0) {
    indexValue = findClosestIndex(time, compressedTimes, timeToIndex);
  } else if (timeToIndex) {
    indexValue = timeToIndex(time);
  }

  if (timeToIndex && indexValue === undefined) return undefined;
  const xValue = indexValue ?? time;
  const x = xScale(xValue);
  return Number.isFinite(x) ? x : undefined;
};

const toTimeNumber = (value: number | Date): number => (
  value instanceof Date ? value.getTime() : value
);

/**
 * Resolve a time value to an x-pixel coordinate, with linear extrapolation
 * when the time is outside the visible data range.
 */
export const resolveXWithExtrapolation = (
  time: number,
  xScale: XScale,
  timeToIndex: ((t: number) => number | undefined) | undefined,
  indexToTime: ((i: number) => number) | undefined,
  dataLength: number,
  compressedTimes: number[] | undefined,
  chartWidth?: number,
): number | undefined => {
  const resolved = resolveX(time, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  if (resolved !== undefined) return resolved;

  let firstTime: number | undefined;
  let lastTime: number | undefined;
  let firstX: number | undefined;
  let lastX: number | undefined;

  if (timeToIndex && indexToTime && dataLength > 0) {
    if (!compressedTimes || compressedTimes.length === 0) return undefined;
    // In compressed/index-based mode the xScale domain is [0, N] and
    // gaps are non-uniform (weekends, overnight). Resolve via the shared
    // binary-search + local-interpolation helper so this path and the
    // line-series remap path (DWLFChart.remapSeriesData) agree.
    const idx = resolveFractionalIndex(compressedTimes, time);
    if (idx === undefined) return undefined;
    const x = xScale(idx);
    return Number.isFinite(x) ? x : undefined;
  } else if (xScale.invert) {
    const range = xScale.range ? xScale.range() : [0, chartWidth ?? 0];
    const start = xScale.invert(range[0]);
    const end = xScale.invert(range[1]);
    firstTime = toTimeNumber(start);
    lastTime = toTimeNumber(end);
    firstX = xScale(firstTime);
    lastX = xScale(lastTime);
  }

  if (
    firstTime === undefined
    || lastTime === undefined
    || !Number.isFinite(firstTime)
    || !Number.isFinite(lastTime)
    || firstX === undefined
    || lastX === undefined
    || !Number.isFinite(firstX)
    || !Number.isFinite(lastX)
  ) return undefined;

  const timeSpan = lastTime - firstTime;
  if (!Number.isFinite(timeSpan) || timeSpan === 0) return undefined;

  const pixelsPerTime = (lastX - firstX) / timeSpan;
  if (!Number.isFinite(pixelsPerTime)) return undefined;

  const extrapolated = firstX + (time - firstTime) * pixelsPerTime;
  return Number.isFinite(extrapolated) ? extrapolated : undefined;
};
