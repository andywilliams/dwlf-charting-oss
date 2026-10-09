import { useEffect, useRef, useState } from 'react';
import { createRangeTween, type RangeTween, type RangeTweenEnv } from '../utils/rangeTween';
import type { VisibleRange } from '../utils/visibleRange';

const browserEnv: RangeTweenEnv = {
  requestFrame: step => requestAnimationFrame(step),
  cancelFrame: id => cancelAnimationFrame(id),
  now: () => performance.now(),
  reducedMotion: () => typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

/**
 * The range the chart shows while it follows `target` (see createRangeTween). Before the first
 * effect runs — and in server rendering, where effects never run — that is `target` itself.
 */
export default function useTweenedRange(
  target: VisibleRange | undefined,
  durationMs: number,
  onSettled?: (range: VisibleRange) => void,
): VisibleRange | undefined {
  const [shown, setShown] = useState<VisibleRange | undefined>(target);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const tweenRef = useRef<RangeTween | null>(null);
  const startTime = target?.startTime;
  const endTime = target?.endTime;

  useEffect(() => {
    const tween = createRangeTween(browserEnv, setShown, range => settledRef.current?.(range));
    tweenRef.current = tween;
    return () => tween.stop();
  }, []);

  useEffect(() => {
    const goal = startTime === undefined || endTime === undefined ? undefined : { startTime, endTime };
    tweenRef.current?.moveTo(goal, durationMs);
  }, [startTime, endTime, durationMs]);

  return shown;
}
