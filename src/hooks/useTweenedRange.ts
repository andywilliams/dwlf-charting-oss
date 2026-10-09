import { useEffect, useRef, useState } from 'react';
import { interpolateRange, type TimeRange } from '../utils/visibleRange';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Follows `target`, easing from wherever it currently is over `durationMs`. The first range, a
 * zero duration, and a reader who prefers reduced motion all jump straight there. A new target
 * mid-move starts from the range on screen, so the motion never snaps back.
 */
export default function useTweenedRange(target: TimeRange | undefined, durationMs: number): TimeRange | undefined {
  const [current, setCurrent] = useState<TimeRange | undefined>(target);
  const shownRef = useRef<TimeRange | undefined>(target);
  const from = target?.from;
  const to = target?.to;

  useEffect(() => {
    if (from === undefined || to === undefined) {
      shownRef.current = undefined;
      setCurrent(undefined);
      return undefined;
    }
    const goal = { from, to };
    const start = shownRef.current;
    if (!start || durationMs <= 0 || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      shownRef.current = goal;
      setCurrent(goal);
      return undefined;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / durationMs);
      const next = interpolateRange(start, goal, k);
      shownRef.current = next;
      setCurrent(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, durationMs]);

  return current;
}
