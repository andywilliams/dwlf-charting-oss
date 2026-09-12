import { describe, expect, it } from 'vitest';
import type { XScale } from '../../../charting/types';
import { screenToTimeDelta } from '../annotationUtils';

// Four bars, one minute apart. `timeToIndex` knows only these four instants, which is what
// makes the fallback arm reachable: any other time has no index.
const BARS = [1_000, 2_000, 3_000, 4_000];
const indexOf = (time: number): number | undefined => {
  const i = BARS.indexOf(time);
  return i === -1 ? undefined : i;
};
const timeOf = (index: number): number => BARS[Math.max(0, Math.min(BARS.length - 1, index))];

// One index step per 10 pixels, so a delta of 10 moves exactly one bar.
const xScale = ((value: number) => value * 10) as XScale;
xScale.invert = (value: number) => value / 10;

describe('screenToTimeDelta', () => {
  it('converts a drag from a time that IS a bar', () => {
    // startTime 2000 is index 1; +10px is index 2, which is 3000.
    expect(screenToTimeDelta(2_000, 10, xScale, indexOf, timeOf, BARS.length, BARS)).toBe(3_000);
  });

  it('converts a drag from a time that is NOT a bar', () => {
    // 2_400 has no index. This is the arm that called findClosestTime without importing
    // it: before that was fixed, reaching this line threw a ReferenceError rather than
    // returning a time. 2_400 snaps to 2_000 (index 1); +10px is index 2, which is 3000.
    expect(() => screenToTimeDelta(2_400, 10, xScale, indexOf, timeOf, BARS.length, BARS)).not.toThrow();
    expect(screenToTimeDelta(2_400, 10, xScale, indexOf, timeOf, BARS.length, BARS)).toBe(3_000);
  });

  it('leaves times alone when gap compression is off', () => {
    // No timeToIndex: the value is a raw time on both sides of the scale.
    expect(screenToTimeDelta(2_000, 10, xScale, undefined, undefined, 0, undefined)).toBe(2_001);
  });

  it('returns the start time unchanged when the scale cannot invert', () => {
    const noInvert = ((value: number) => value * 10) as XScale;
    expect(screenToTimeDelta(2_000, 10, noInvert, indexOf, timeOf, BARS.length, BARS)).toBe(2_000);
  });
});
