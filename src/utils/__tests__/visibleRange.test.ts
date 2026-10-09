import { describe, expect, it } from 'vitest';
import { easeInOutCubic, interpolateRange, viewportForRange } from '../visibleRange';

const WEEK = 7 * 86_400_000;
const t0 = Date.UTC(2026, 0, 5);
const times = [0, 1, 2, 3, 4].map(i => t0 + i * WEEK);

describe('viewportForRange', () => {
  it('covers the bars inside the range, inclusive at both ends', () => {
    expect(viewportForRange(times, WEEK, { from: times[1], to: times[3] })).toEqual({ start: 1, end: 4 });
  });

  it('starts at the next bar and ends at the previous one when the range falls between bars', () => {
    expect(viewportForRange(times, WEEK, { from: times[1] + 1, to: times[3] - 1 })).toEqual({ start: 2, end: 3 });
  });

  it('counts blank slots past the last bar, one per bar of the timeframe', () => {
    expect(viewportForRange(times, WEEK, { from: times[3], to: times[4] + 2.5 * WEEK })).toEqual({ start: 3, end: 7 });
    expect(viewportForRange(times, WEEK, { from: times[4] + 0.5 * WEEK, to: times[4] + 3 * WEEK })).toEqual({ start: 5, end: 8 });
  });

  it('clamps a range that starts before the first bar', () => {
    expect(viewportForRange(times, WEEK, { from: times[0] - 10 * WEEK, to: times[1] })).toEqual({ start: 0, end: 2 });
  });

  it('is empty, never negative, for a range between two bars or with no bars', () => {
    expect(viewportForRange(times, WEEK, { from: times[1] + 1, to: times[1] + 2 })).toEqual({ start: 2, end: 2 });
    expect(viewportForRange([], WEEK, { from: 0, to: 1 })).toEqual({ start: 0, end: 0 });
  });
});

describe('interpolateRange', () => {
  const a = { from: 0, to: 100 };
  const b = { from: 50, to: 300 };

  it('runs from the first range to the second, eased', () => {
    expect(interpolateRange(a, b, 0)).toEqual(a);
    expect(interpolateRange(a, b, 1)).toEqual(b);
    expect(interpolateRange(a, b, 0.5)).toEqual({ from: 25, to: 200 });
    expect(interpolateRange(a, b, 0.25).from).toBeCloseTo(50 * easeInOutCubic(0.25));
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
