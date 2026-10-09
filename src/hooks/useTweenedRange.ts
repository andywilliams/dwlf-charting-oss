import { useEffect, useRef, useState } from 'react';
import { createRangeTween, type RangeTween, type RangeTweenEnv } from '../utils/rangeTween';
import type { VisibleRange } from '../utils/visibleRange';

const hasFrames = () => typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';

/** The browser's clock. Anywhere without animation frames (a DOM-less test renderer) every move jumps. */
const browserEnv: RangeTweenEnv = {
  requestFrame: step => requestAnimationFrame(step),
  cancelFrame: id => cancelAnimationFrame(id),
  now: () => performance.now(),
  reducedMotion: () => !hasFrames()
    || (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
};

/**
 * The range the chart shows while it follows `target` (see createRangeTween). Before the first
 * effect runs — and in server rendering, where effects never run — that is `target` itself. One
 * tween lives as long as the component, so an effect re-run (StrictMode, a re-shown Activity)
 * keeps its record of what is shown and never reports the same range settled twice.
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
  if (tweenRef.current === null) {
    tweenRef.current = createRangeTween(browserEnv, setShown, range => settledRef.current?.(range));
  }
  const startTime = target?.startTime;
  const endTime = target?.endTime;

  useEffect(() => {
    const goal = startTime === undefined || endTime === undefined ? undefined : { startTime, endTime };
    tweenRef.current?.moveTo(goal, durationMs);
  }, [startTime, endTime, durationMs]);

  useEffect(() => () => tweenRef.current?.stop(), []);

  return shown;
}
