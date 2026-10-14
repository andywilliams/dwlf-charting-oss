import { describe, expect, it } from 'vitest';
import { createRangeTween } from '../rangeTween';
import { interpolateRangeZoom, type VisibleRange } from '../visibleRange';

/** A hand-cranked frame clock: `tick(ms)` advances time and runs the frame waiting, if any. */
function harness(reduced = false) {
  let t = 0;
  let pending: { id: number; step: (now: number) => void } | null = null;
  let nextId = 1;
  const frames: Array<VisibleRange | undefined> = [];
  const settled: VisibleRange[] = [];
  const tween = createRangeTween(
    {
      requestFrame: step => { pending = { id: nextId, step }; return nextId++; },
      cancelFrame: id => { if (pending?.id === id) pending = null; },
      now: () => t,
      reducedMotion: () => reduced,
    },
    range => frames.push(range),
    range => settled.push(range),
  );
  const tick = (ms: number) => {
    t += ms;
    const p = pending;
    pending = null;
    p?.step(t);
  };
  const running = () => pending !== null;
  return { tween, frames, settled, tick, running };
}

const A = { startTime: 0, endTime: 100 };
const B = { startTime: 100, endTime: 300 };
const C = { startTime: 1000, endTime: 2000 };

describe('createRangeTween', () => {
  it('jumps to the first range and settles at once, with no frames to run', () => {
    const h = harness();
    h.tween.moveTo(A, 700);
    expect(h.frames).toEqual([A]);
    expect(h.settled).toEqual([A]);
    expect(h.running()).toBe(false);
  });

  it('eases to a new range over the duration, then settles once', () => {
    const h = harness();
    h.tween.moveTo(A, 700);
    h.tween.moveTo(B, 700);
    h.tick(0);
    expect(h.frames.at(-1)).toEqual(A);
    h.tick(350);
    expect(h.frames.at(-1)).toEqual({ startTime: 50, endTime: 200 });
    expect(h.settled).toEqual([A]);
    h.tick(350);
    expect(h.frames.at(-1)).toEqual(B);
    expect(h.settled).toEqual([A, B]);
    expect(h.running()).toBe(false);
  });

  it('starts a replacement move from the range on screen; the abandoned goal never settles', () => {
    const h = harness();
    h.tween.moveTo(A, 700);
    h.tween.moveTo(B, 700);
    h.tick(0);
    h.tick(350);
    const midway = h.frames.at(-1)!;
    h.tween.moveTo(C, 700);
    h.tick(0);
    expect(h.frames.at(-1)).toEqual(midway);
    h.tick(700);
    expect(h.frames.at(-1)).toEqual(C);
    expect(h.settled).toEqual([A, C]);
  });

  it('does nothing when asked for the range already shown, so it never settles twice', () => {
    const h = harness();
    h.tween.moveTo(A, 700);
    h.tween.moveTo({ ...A }, 300);
    expect(h.frames).toEqual([A]);
    expect(h.settled).toEqual([A]);
    expect(h.running()).toBe(false);
  });

  it('jumps instead of easing for a zero duration or reduced motion', () => {
    const zero = harness();
    zero.tween.moveTo(A, 700);
    zero.tween.moveTo(B, 0);
    expect(zero.frames.at(-1)).toEqual(B);
    expect(zero.settled).toEqual([A, B]);
    expect(zero.running()).toBe(false);

    const reduced = harness(true);
    reduced.tween.moveTo(A, 700);
    reduced.tween.moveTo(B, 700);
    expect(reduced.frames.at(-1)).toEqual(B);
    expect(reduced.settled).toEqual([A, B]);
    expect(reduced.running()).toBe(false);
  });

  it('clears to no range, cancelling a move in flight, and jumps when a range is set again', () => {
    const h = harness();
    h.tween.moveTo(A, 700);
    h.tween.moveTo(B, 700);
    h.tween.moveTo(undefined, 700);
    expect(h.frames.at(-1)).toBeUndefined();
    expect(h.running()).toBe(false);
    h.tween.moveTo(C, 700);
    expect(h.frames.at(-1)).toEqual(C);
    expect(h.settled).toEqual([A, C]);
  });

  it('stop() abandons the move without settling', () => {
    const h = harness();
    h.tween.moveTo(A, 700);
    h.tween.moveTo(B, 700);
    h.tween.stop();
    expect(h.running()).toBe(false);
    expect(h.settled).toEqual([A]);
  });

  it('eases with the interpolation the move asks for', () => {
    const h = harness();
    const wide = { startTime: 0, endTime: 10_000 };
    const narrow = { startTime: 9_900, endTime: 10_000 };
    h.tween.moveTo(wide, 700);
    h.tween.moveTo(narrow, 700, interpolateRangeZoom);
    h.tick(0);
    h.tick(350);
    const mid = h.frames.at(-1)!;
    expect(mid.endTime).toBeCloseTo(10_000, 6);
    expect(mid.endTime - mid.startTime).toBeCloseTo(1_000, 6);
    h.tick(350);
    expect(h.settled.at(-1)).toEqual(narrow);
  });

  it('lands exactly on the goal, settled once, whatever the interpolation computes', () => {
    const h = harness();
    const off = (_a: VisibleRange, b: VisibleRange, k: number) => ({ startTime: b.startTime + 0.25 * k, endTime: b.endTime });
    h.tween.moveTo(A, 700);
    h.tween.moveTo(C, 700, off);
    h.tick(0);
    h.tick(700);
    expect(h.frames.at(-1)).toEqual(C);
    expect(h.settled).toEqual([A, C]);
    h.tween.moveTo(C, 700, off);
    expect(h.running()).toBe(false);
    expect(h.settled).toEqual([A, C]);
  });
});
