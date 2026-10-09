import { useEffect, useRef, useState } from 'react';
import { interpolateRange, type VisibleRange } from '../utils/visibleRange';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Follows `target`, easing from wherever it currently is over `durationMs`, and calls `onSettled`
 * once the range on screen is the target. The first range, a zero duration, and a reader who
 * prefers reduced motion all jump straight there (and settle at once). A new target mid-move
 * starts from the range on screen, so the motion never snaps back; the abandoned move never settles.
 */
export default function useTweenedRange(
  target: VisibleRange | undefined,
  durationMs: number,
  onSettled?: (range: VisibleRange) => void,
): VisibleRange | undefined {
  const [current, setCurrent] = useState<VisibleRange | undefined>(target);
  const shownRef = useRef<VisibleRange | undefined>(target);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const startTime = target?.startTime;
  const endTime = target?.endTime;

  useEffect(() => {
    if (startTime === undefined || endTime === undefined) {
      shownRef.current = undefined;
      setCurrent(undefined);
      return undefined;
    }
    const goal = { startTime, endTime };
    const from = shownRef.current;
    if (!from || durationMs <= 0 || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      shownRef.current = goal;
      setCurrent(goal);
      settledRef.current?.(goal);
      return undefined;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / durationMs);
      const next = interpolateRange(from, goal, k);
      shownRef.current = next;
      setCurrent(next);
      if (k < 1) {
        frame = requestAnimationFrame(step);
      } else {
        settledRef.current?.(goal);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [startTime, endTime, durationMs]);

  return current;
}
