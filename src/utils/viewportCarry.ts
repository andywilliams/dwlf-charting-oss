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

/** The first index whose time is at or after `t` (times ascending); `times.length` when none is. */
const lowerBound = (times: number[], t: number): number => {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Whether `next` is `prev` with bars added or updated rather than a different series: the bar `prev`
 * started with is still in `next`, unchanged. Its last bar is not compared, because a live bar's
 * prices move between updates; a different symbol or timeframe fails on the first bar.
 */
export function continuesSeries(prev: OhlcBar[], next: OhlcBar[]): boolean {
  if (prev.length === 0 || next.length === 0) return false;
  const first = prev[0];
  const i = lowerBound(next.map(bar => bar.t), first.t);
  const match = next[i];
  return !!match && match.t === first.t && match.o === first.o && match.h === first.h && match.l === first.l && match.c === first.c;
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
    start = lowerBound(nextTimes, prevTimes[window.start]);
  } else {
    // Starting inside the blank slots: keep the same distance past the last bar.
    start = window.start + (nextTimes.length - prevTimes.length);
  }
  start = Math.max(0, Math.min(start, nextMax - count));
  return { start, end: start + count };
}
