import { describe, expect, it } from 'vitest';
import { easeInOutCubic, interpolateRange, interpolateRangeZoom, interpolatorFor, viewportForRange } from '../visibleRange';

const WEEK = 7 * 86_400_000;
const t0 = Date.UTC(2026, 0, 5);
const times = [0, 1, 2, 3, 4].map(i => t0 + i * WEEK);

describe('viewportForRange', () => {
  it('covers the bars inside the range, inclusive at both ends', () => {
    expect(viewportForRange(times, WEEK, { startTime: times[1], endTime: times[3] })).toEqual({ start: 1, end: 4 });
  });

  it('starts at the next bar and ends at the previous one when the range falls between bars', () => {
    expect(viewportForRange(times, WEEK, { startTime: times[1] + 1, endTime: times[3] - 1 })).toEqual({ start: 2, end: 3 });
  });

  it('counts blank slots past the last bar, one per bar of the timeframe', () => {
    expect(viewportForRange(times, WEEK, { startTime: times[3], endTime: times[4] + 2.5 * WEEK })).toEqual({ start: 3, end: 7 });
    expect(viewportForRange(times, WEEK, { startTime: times[4] + 0.5 * WEEK, endTime: times[4] + 3 * WEEK })).toEqual({ start: 5, end: 8 });
  });

  it('clamps a range that starts before the first bar', () => {
    expect(viewportForRange(times, WEEK, { startTime: times[0] - 10 * WEEK, endTime: times[1] })).toEqual({ start: 0, end: 2 });
  });

  it('is empty, never negative, for a range between two bars or with no bars', () => {
    expect(viewportForRange(times, WEEK, { startTime: times[1] + 1, endTime: times[1] + 2 })).toEqual({ start: 2, end: 2 });
    expect(viewportForRange([], WEEK, { startTime: 0, endTime: 1 })).toEqual({ start: 0, end: 0 });
  });
});

describe('interpolateRange', () => {
  const a = { startTime: 0, endTime: 100 };
  const b = { startTime: 50, endTime: 300 };

  it('runs from the first range to the second, eased', () => {
    expect(interpolateRange(a, b, 0)).toEqual(a);
    expect(interpolateRange(a, b, 1)).toEqual(b);
    expect(interpolateRange(a, b, 0.5)).toEqual({ startTime: 25, endTime: 200 });
    expect(interpolateRange(a, b, 0.25).startTime).toBeCloseTo(50 * easeInOutCubic(0.25));
  });

  it('clamps progress outside 0..1', () => {
    expect(interpolateRange(a, b, -1)).toEqual(a);
    expect(interpolateRange(a, b, 2)).toEqual(b);
  });
});

describe('easeInOutCubic', () => {
  it('is slow at both ends and symmetric about the middle', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
    expect(easeInOutCubic(0.2) + easeInOutCubic(0.8)).toBeCloseTo(1);
  });
});

describe('interpolateRangeZoom', () => {
  const HOUR = 3_600_000;
  const end = Date.UTC(2026, 9, 14);
  const weekly = { startTime: end - 320 * WEEK, endTime: end };
  const hourly = { startTime: end - 260 * HOUR, endTime: end };
  const span = (r: { startTime: number; endTime: number }) => r.endTime - r.startTime;

  it('starts and ends on its goals', () => {
    expect(interpolateRangeZoom(weekly, hourly, 0)).toEqual(weekly);
    expect(interpolateRangeZoom(weekly, hourly, 1)).toEqual(hourly);
  });

  it('scales the span geometrically, so halfway through the ease it is the geometric mean', () => {
    const mid = interpolateRangeZoom(weekly, hourly, 0.5);
    expect(span(mid)).toBeCloseTo(Math.sqrt(span(weekly) * span(hourly)), -1);
    // A linear ease would still show about half the weekly span here.
    expect(span(interpolateRange(weekly, hourly, 0.5))).toBeGreaterThan(span(weekly) / 2 - WEEK);
  });

  it('keeps the shared time in place: two ranges ending together zoom about their end', () => {
    [0.2, 0.5, 0.8].forEach(k => expect(interpolateRangeZoom(weekly, hourly, k).endTime).toBeCloseTo(end, -1));
  });

  it('pans like interpolateRange when the spans match', () => {
    const later = { startTime: weekly.startTime + 10 * WEEK, endTime: weekly.endTime + 10 * WEEK };
    expect(interpolateRangeZoom(weekly, later, 0.3)).toEqual(interpolateRange(weekly, later, 0.3));
  });
});

describe('interpolatorFor', () => {
  it('names the zoom ease, and falls back to linear', () => {
    expect(interpolatorFor('zoom')).toBe(interpolateRangeZoom);
    expect(interpolatorFor('linear')).toBe(interpolateRange);
    expect(interpolatorFor(undefined)).toBe(interpolateRange);
    expect(interpolatorFor('bogus' as never)).toBe(interpolateRange);
  });
});
