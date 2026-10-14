import { describe, expect, it } from 'vitest';
import { carryViewport, continuesSeries } from '../viewportCarry';

const WEEK = 7 * 86_400_000;
const t0 = Date.UTC(2020, 0, 6);
const bar = (i: number, shift = 0) => ({ t: t0 + i * WEEK, o: 100 + i + shift, h: 110 + i + shift, l: 90 + i + shift, c: 105 + i + shift });
const series = (from: number, to: number, shift = 0) => Array.from({ length: to - from }, (_, k) => bar(from + k, shift));
const times = (bars: Array<{ t: number }>) => bars.map(b => b.t);

describe('continuesSeries', () => {
  it('is true for older bars prepended, newer bars appended, or the live bar revised', () => {
    const prev = series(100, 200);
    expect(continuesSeries(prev, series(0, 200))).toBe(true);
    expect(continuesSeries(prev, series(100, 205))).toBe(true);
    expect(continuesSeries(prev, [...series(100, 199), { ...bar(199), c: 999 }])).toBe(true);
  });

  it('is false for a different series on the same dates, or one that no longer holds the first bar', () => {
    const prev = series(100, 200);
    expect(continuesSeries(prev, series(100, 200, 50))).toBe(false);
    expect(continuesSeries(prev, series(101, 200))).toBe(false);
    expect(continuesSeries([], series(0, 10))).toBe(false);
    expect(continuesSeries(prev, [])).toBe(false);
  });
});

describe('carryViewport', () => {
  const extra = 30;

  it('keeps the same first bar when older bars are prepended, so the view does not move', () => {
    const prev = times(series(100, 200));
    const next = times(series(0, 200));
    expect(carryViewport(prev, next, { start: 10, end: 60 }, extra)).toEqual({ start: 110, end: 160 });
  });

  it('keeps a window that reached the right edge on the newest bars, at the same width', () => {
    const prev = times(series(100, 200));
    const next = times(series(0, 205));
    const window = { start: 100 + extra - 40, end: 100 + extra };
    expect(carryViewport(prev, next, window, extra)).toEqual({ start: 205 + extra - 40, end: 205 + extra });
  });

  it('leaves a window in the middle where it is when bars are appended', () => {
    const prev = times(series(0, 100));
    const next = times(series(0, 103));
    expect(carryViewport(prev, next, { start: 20, end: 50 }, extra)).toEqual({ start: 20, end: 50 });
  });

  it('finds the first bar by time when filler bars change the index count', () => {
    const prev = [t0, t0 + 3 * WEEK, t0 + 4 * WEEK];
    const next = [t0 - 2 * WEEK, t0 - WEEK, t0, t0 + WEEK, t0 + 2 * WEEK, t0 + 3 * WEEK, t0 + 4 * WEEK];
    expect(carryViewport(prev, next, { start: 1, end: 2 }, 0)).toEqual({ start: 5, end: 6 });
  });

  it('keeps a window that starts in the blank slots the same distance past the last bar', () => {
    const prev = times(series(0, 100));
    const next = times(series(0, 102));
    // Not at the right edge: ends 5 slots short of it.
    expect(carryViewport(prev, next, { start: 105, end: 125 }, extra)).toEqual({ start: 107, end: 127 });
  });

  it('clamps the width to the new series', () => {
    const prev = times(series(0, 100));
    const next = times(series(50, 60));
    const carried = carryViewport(prev, next, { start: 0, end: 130 }, extra);
    expect(carried).toEqual({ start: 0, end: 40 });
  });
});
