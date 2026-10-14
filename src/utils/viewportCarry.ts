import { viewportForRange, type VisibleRange } from './visibleRange';

/** A pan viewport in bar indices: `start` inclusive, `end` exclusive, over real bars then blank slots. */
export interface ViewportWindow {
  start: number;
  end: number;
}

interface OhlcBar {
  t: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
}

/** The first index whose time is at or after `t` (ascending by `t`); `items.length` when none is. */
const lowerBound = <T,>(items: T[], timeOf: (item: T) => number, t: number): number => {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeOf(items[mid]) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const sameBarIn = (bars: OhlcBar[], bar: OhlcBar): boolean => {
  const match = bars[lowerBound(bars, b => b.t, bar.t)];
  return !!match && match.t === bar.t && match.o === bar.o && match.h === bar.h && match.l === bar.l && match.c === bar.c;
};

/**
 * Whether `next` is `prev` with bars added, dropped at the old end or revised, rather than a
 * different series: the bar at `anchor` (the first one the reader sees), or else the last settled
 * bar, is still in `next` unchanged. The last bar itself is never the evidence, because a live bar's
 * prices move between updates; a different symbol or timeframe fails on any settled bar.
 */
export function continuesSeries(prev: OhlcBar[], next: OhlcBar[], anchor = 0): boolean {
  if (prev.length === 0 || next.length === 0) return false;
  const lastSettled = Math.max(0, prev.length - 2);
  const candidates = [Math.max(0, Math.min(anchor, lastSettled)), lastSettled];
  return candidates.some(i => sameBarIn(next, prev[i]));
}

/**
 * Where a viewport goes when its series grows or is revised, so the reader keeps looking at the same
 * thing: a window that reached the right edge (the blank slots after the last bar) stays there and
 * follows new bars; any other window keeps its first bar, found by time, so bars added before it
 * shift the indices without moving the view. The width in bars is kept, clamped to the new series.
 */
export function carryViewport(
  prevTimes: number[],
  nextTimes: number[],
  window: ViewportWindow,
  extraSlots: number,
): ViewportWindow {
  const nextMax = nextTimes.length + extraSlots;
  const count = Math.max(0, Math.min(window.end - window.start, nextMax));
  const atRightEdge = window.end >= prevTimes.length + extraSlots;
  let start: number;
  if (atRightEdge) {
    start = nextMax - count;
  } else if (window.start < prevTimes.length) {
    start = lowerBound(nextTimes, t => t, prevTimes[window.start]);
  } else {
    // Starting inside the blank slots: keep the same distance past the last bar.
    start = window.start + (nextTimes.length - prevTimes.length);
  }
  start = Math.max(0, Math.min(start, nextMax - count));
  return { start, end: start + count };
}

export interface PanPlacementInput {
  /** The bars the window was last placed on; null before the first placement. */
  prev: { bars: OhlcBar[]; times: number[] } | null;
  bars: OhlcBar[];
  times: number[];
  /** False when pan/zoom has just taken over (first bars, or after a host `visibleRange`). */
  initialized: boolean;
  /** A range handed over by the host for pan/zoom to open on. */
  pending: VisibleRange | null;
  window: ViewportWindow;
  extraSlots: number;
  initialVisibleCount: number;
  slotMs: number;
}

/**
 * The pan window for a new set of bars. `window` null means leave it alone (the same bars, revised);
 * `fresh` means the window was opened anew (a different series, or pan/zoom taking over), on the
 * pending range when there is one, else on the latest bars.
 */
export function nextPanWindow(input: PanPlacementInput): { window: ViewportWindow | null; fresh: boolean } {
  const { prev, bars, times, initialized, pending, window, extraSlots, initialVisibleCount, slotMs } = input;
  if (initialized && prev && continuesSeries(prev.bars, bars, window.start)) {
    const sameTimes = prev.times.length === times.length
      && prev.times[0] === times[0]
      && prev.times[prev.times.length - 1] === times[times.length - 1];
    return { window: sameTimes ? null : carryViewport(prev.times, times, window, extraSlots), fresh: false };
  }
  if (pending) {
    const ranged = viewportForRange(times, slotMs, pending);
    if (ranged.end > ranged.start) return { window: ranged, fresh: true };
  }
  const total = times.length + extraSlots;
  const count = Math.min(initialVisibleCount, total);
  return { window: { start: total - count, end: total }, fresh: true };
}
