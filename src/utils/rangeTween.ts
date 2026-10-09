import { interpolateRange, type VisibleRange } from './visibleRange';

/** What a range tween needs from its surroundings, injected so it runs (and is tested) without a browser. */
export interface RangeTweenEnv {
  requestFrame: (step: (now: number) => void) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  reducedMotion: () => boolean;
}

export interface RangeTween {
  /** Head for `goal`. The first goal, a zero duration, reduced motion or no change jump at once. */
  moveTo(goal: VisibleRange | undefined, durationMs: number): void;
  /** Stop any move in flight; it never settles. */
  stop(): void;
}

const same = (a: VisibleRange, b: VisibleRange) => a.startTime === b.startTime && a.endTime === b.endTime;

/**
 * Eases the shown range towards each new goal and reports every frame through `onFrame`. A move
 * that completes calls `onSettled` once with its goal; a move replaced mid-way starts from the range
 * on screen (so nothing snaps back) and the abandoned goal never settles. Asking again for the range
 * already shown does nothing, so it is never reported settled twice.
 */
export function createRangeTween(
  env: RangeTweenEnv,
  onFrame: (range: VisibleRange | undefined) => void,
  onSettled: (range: VisibleRange) => void,
): RangeTween {
  let shown: VisibleRange | undefined;
  let frame: number | null = null;

  const stop = () => {
    if (frame !== null) env.cancelFrame(frame);
    frame = null;
  };

  const show = (range: VisibleRange | undefined) => {
    shown = range;
    onFrame(range);
  };

  return {
    stop,
    moveTo(goal, durationMs) {
      const moving = frame !== null;
      stop();
      if (!goal) {
        if (shown) show(undefined);
        return;
      }
      if (shown && same(shown, goal) && !moving) {
        return;
      }
      const from = shown;
      if (!from || durationMs <= 0 || env.reducedMotion()) {
        show(goal);
        onSettled(goal);
        return;
      }
      const t0 = env.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / durationMs);
        show(interpolateRange(from, goal, k));
        if (k < 1) {
          frame = env.requestFrame(step);
        } else {
          frame = null;
          onSettled(goal);
        }
      };
      frame = env.requestFrame(step);
    },
  };
}
