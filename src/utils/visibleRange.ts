/** A span of the time axis, in epoch milliseconds. `endTime` may run past the last bar into the blank slots. */
export interface VisibleRange {
  startTime: number;
  endTime: number;
}

/** The first index whose time is at or after `t`; past the last bar, counted in whole slots. */
const indexAtOrAfter = (times: number[], slotMs: number, t: number): number => {
  const last = times.length - 1;
  if (t > times[last]) {
    return last + Math.ceil((t - times[last]) / slotMs);
  }
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** The last index whose time is at or before `t`; past the last bar, counted in whole slots. -1 before the first. */
const indexAtOrBefore = (times: number[], slotMs: number, t: number): number => {
  const last = times.length - 1;
  if (t >= times[last]) {
    return last + Math.floor((t - times[last]) / slotMs);
  }
  const after = indexAtOrAfter(times, slotMs, t);
  return times[after] === t ? after : after - 1;
};

/**
 * The bar indices a time range shows: `start` inclusive, `end` exclusive, in the same index space
 * as the pan viewport (real bars, then one blank slot per bar of the timeframe). The range's own
 * times stay the x-axis domain, so a range that moves by less than a bar still moves the axis.
 */
export function viewportForRange(times: number[], slotMs: number, range: VisibleRange): { start: number; end: number } {
  if (times.length === 0) {
    return { start: 0, end: 0 };
  }
  const start = Math.max(0, indexAtOrAfter(times, slotMs, range.startTime));
  const end = Math.max(start, indexAtOrBefore(times, slotMs, range.endTime) + 1);
  return { start, end };
}

/** Ease in and out (cubic): slow at both ends, so a camera move reads as one motion. */
export const easeInOutCubic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** The range `k` of the way from `a` to `b`, eased. */
export function interpolateRange(a: VisibleRange, b: VisibleRange, k: number): VisibleRange {
  const e = easeInOutCubic(Math.max(0, Math.min(1, k)));
  return { startTime: a.startTime + (b.startTime - a.startTime) * e, endTime: a.endTime + (b.endTime - a.endTime) * e };
}
