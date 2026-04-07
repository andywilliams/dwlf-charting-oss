import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Chart animation phase types
 */
export type ChartAnimationPhase = 
  | 'idle'         // Not started
  | 'background'   // Chart background visible
  | 'candles'      // Progressive left-to-right candle reveal
  | 'indicators'   // Staggered indicator line fade-in
  | 'events'       // Event markers drop-in animation
  | 'annotations'  // Annotation layers fade-in
  | 'complete';    // All animations complete

/**
 * Animation state interface
 */
export interface ChartAnimationState {
  phase: ChartAnimationPhase;
  candleRevealIndex: number;
  layerOpacities: Record<string, number>;
  staggerDelay: number;
  isReducedMotion: boolean;
}

/**
 * Animation control interface
 */
export interface ChartAnimationControls {
  startAnimation: () => void;
  skipToEnd: () => void;
  resetAnimation: () => void;
  setAnimationSpeed: (multiplier: number) => void;
}

/**
 * Hook options
 */
export interface UseChartAnimationsOptions {
  totalCandles?: number;
  animationSpeed?: number;
  autoStart?: boolean;
  staggerDelay?: number;
  onPhaseChange?: (phase: ChartAnimationPhase) => void;
  onAnimationComplete?: () => void;
}

/**
 * Default indicator animation order
 */
export const INDICATOR_ANIMATION_ORDER = [
  'ema-10', 'ema-20', 'sma-10', 'sma-20',
  'bollinger-upper', 'bollinger-middle', 'bollinger-lower',
  'ema-50', 'sma-50', 'ema-200', 'sma-200',
] as const;

const ALL_INDICATORS_VISIBLE = INDICATOR_ANIMATION_ORDER.reduce<Record<string, number>>(
  (acc, key) => { acc[key] = 1; return acc; }, {}
);

/**
 * Hook for managing chart animation state and controls.
 * 
 * Architecture: A simple phase state machine driven by effects.
 * Each phase schedules the next via setTimeout or RAF, with proper cleanup.
 * No pause/resume complexity — skip-to-end handles interruption.
 */
export default function useChartAnimations(options: UseChartAnimationsOptions = {}) {
  const {
    totalCandles = 0,
    animationSpeed = 1.0,
    autoStart = false,
    staggerDelay = 100,
    onPhaseChange,
    onAnimationComplete,
  } = options;

  // Clamp speed to valid range
  const clampedSpeed = Math.max(0.1, Math.min(5.0, animationSpeed));
  
  // Stable refs for callbacks — prevents effect re-runs
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const speedRef = useRef(clampedSpeed);
  const isReducedMotionRef = useRef(false);
  const phaseRef = useRef<ChartAnimationPhase>('idle'); // Track phase for stable controls
  
  useEffect(() => { onPhaseChangeRef.current = onPhaseChange; }, [onPhaseChange]);
  useEffect(() => { onAnimationCompleteRef.current = onAnimationComplete; }, [onAnimationComplete]);
  useEffect(() => { speedRef.current = clampedSpeed; }, [clampedSpeed]);

  const [state, setState] = useState<ChartAnimationState>({
    phase: autoStart ? 'background' : 'idle',
    candleRevealIndex: 0,
    layerOpacities: {},
    staggerDelay,
    isReducedMotion: false,
  });

  // Sync phaseRef with state changes
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // Sync staggerDelay changes
  useEffect(() => {
    setState(prev => ({ ...prev, staggerDelay }));
  }, [staggerDelay]);

  // Track whether we've started (to gate auto-start)
  const hasStartedRef = useRef(false);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    isReducedMotionRef.current = mq.matches;
    setState(prev => ({ ...prev, isReducedMotion: mq.matches }));
    const handler = (e: MediaQueryListEvent) => {
      isReducedMotionRef.current = e.matches;
      setState(prev => ({ ...prev, isReducedMotion: e.matches }));
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Skip to end when reduced-motion activates mid-animation
  useEffect(() => {
    if (state.isReducedMotion && state.phase !== 'idle' && state.phase !== 'complete') {
      // Force hasStartedRef to false to prevent any race conditions
      hasStartedRef.current = false;
      // Update phaseRef immediately to ensure controls are stable
      phaseRef.current = 'complete';
      
      setState(prev => ({
        ...prev,
        phase: 'complete',
        candleRevealIndex: Math.max(0, totalCandles - 1),
        layerOpacities: { ...ALL_INDICATORS_VISIBLE },
      }));
      onPhaseChangeRef.current?.('complete');
      onAnimationCompleteRef.current?.();
    }
  }, [state.isReducedMotion, state.phase, totalCandles]);

  // --- Phase transitions ---

  // background → candles (after stagger delay)
  useEffect(() => {
    if (state.phase !== 'background') return;
    const id = setTimeout(() => {
      setState(prev => ({ ...prev, phase: 'candles' }));
      onPhaseChangeRef.current?.('candles');
    }, staggerDelay / speedRef.current);
    return () => clearTimeout(id);
  }, [state.phase, staggerDelay]);

  // candles: RAF-based left-to-right reveal
  useEffect(() => {
    if (state.phase !== 'candles') return;

    if (totalCandles === 0) {
      setState(prev => ({ ...prev, phase: 'indicators' }));
      onPhaseChangeRef.current?.('indicators');
      return;
    }

    let startTime: number | null = null;
    let rafId: number;
    // Dynamic rate: always complete in ~2 seconds regardless of candle count
    const targetDuration = 2; // seconds
    const candlesPerSecond = Math.max(30, totalCandles / targetDuration);

    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const idx = Math.min(
        Math.floor(elapsed * candlesPerSecond * speedRef.current),
        totalCandles - 1
      );

      setState(prev => ({ ...prev, candleRevealIndex: idx }));

      if (idx >= totalCandles - 1) {
        setState(prev => ({ ...prev, phase: 'indicators' }));
        onPhaseChangeRef.current?.('indicators');
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state.phase, totalCandles]);

  // indicators: staggered fade-in
  useEffect(() => {
    if (state.phase !== 'indicators') return;

    const delay = 80;
    const ids: ReturnType<typeof setTimeout>[] = [];

    INDICATOR_ANIMATION_ORDER.forEach((key, i) => {
      const id = setTimeout(() => {
        setState(prev => ({
          ...prev,
          layerOpacities: { ...prev.layerOpacities, [key]: 1 },
        }));
      }, (i * delay) / speedRef.current);
      ids.push(id);
    });

    // Transition to events after all indicators visible
    const totalTime = (INDICATOR_ANIMATION_ORDER.length * delay + 100) / speedRef.current;
    const transitionId = setTimeout(() => {
      setState(prev => ({ ...prev, phase: 'events' }));
      onPhaseChangeRef.current?.('events');
    }, totalTime);
    ids.push(transitionId);

    return () => ids.forEach(id => clearTimeout(id));
  }, [state.phase]);

  // events → annotations
  useEffect(() => {
    if (state.phase !== 'events') return;
    const id = setTimeout(() => {
      setState(prev => ({ ...prev, phase: 'annotations' }));
      onPhaseChangeRef.current?.('annotations');
    }, 400 / speedRef.current);
    return () => clearTimeout(id);
  }, [state.phase]);

  // annotations → complete
  useEffect(() => {
    if (state.phase !== 'annotations') return;
    const id = setTimeout(() => {
      setState(prev => ({ ...prev, phase: 'complete' }));
      onPhaseChangeRef.current?.('complete');
      onAnimationCompleteRef.current?.();
    }, 200 / speedRef.current);
    return () => clearTimeout(id);
  }, [state.phase]);

  // --- Controls ---

  const skipToEnd = useCallback(() => {
    const currentPhase = phaseRef.current;
    const shouldFireCallbacks = currentPhase !== 'complete' && currentPhase !== 'idle';
    
    hasStartedRef.current = false;
    phaseRef.current = 'complete';
    setState(prev => ({
      ...prev,
      phase: 'complete',
      candleRevealIndex: Math.max(0, totalCandles - 1),
      layerOpacities: { ...ALL_INDICATORS_VISIBLE },
    }));
    
    // Fire callbacks outside of setState to avoid side effects in updater
    if (shouldFireCallbacks) {
      onPhaseChangeRef.current?.('complete');
      onAnimationCompleteRef.current?.();
    }
  }, [totalCandles]);

  const startAnimation = useCallback(() => {
    if (isReducedMotionRef.current) {
      // For reduced motion, skip directly to complete
      hasStartedRef.current = false;
      setState(prev => ({
        ...prev,
        phase: 'complete',
        candleRevealIndex: Math.max(0, totalCandles - 1),
        layerOpacities: { ...ALL_INDICATORS_VISIBLE },
      }));
      // Fire callbacks outside of setState
      onPhaseChangeRef.current?.('complete');
      onAnimationCompleteRef.current?.();
      return;
    }
    hasStartedRef.current = true;
    setState(prev => ({
      ...prev,
      phase: 'background',
      candleRevealIndex: 0,
      layerOpacities: {},
    }));
    onPhaseChangeRef.current?.('background');
  }, [totalCandles]);

  const resetAnimation = useCallback(() => {
    hasStartedRef.current = false;
    setState(prev => ({
      ...prev,
      phase: 'idle',
      candleRevealIndex: 0,
      layerOpacities: {},
    }));
    onPhaseChangeRef.current?.('idle');
  }, []);

  const setAnimationSpeed = useCallback((multiplier: number) => {
    speedRef.current = Math.max(0.1, Math.min(5.0, multiplier));
  }, []);

  // Memoize controls with stable dependencies (no state.phase dependency)
  const controls = useMemo<ChartAnimationControls>(() => ({
    startAnimation,
    skipToEnd,
    resetAnimation,
    setAnimationSpeed,
  }), [startAnimation, skipToEnd, resetAnimation, setAnimationSpeed]);

  // Auto-start
  useEffect(() => {
    if (autoStart && totalCandles > 0 && state.phase === 'idle' && !hasStartedRef.current) {
      startAnimation();
    }
  }, [autoStart, totalCandles, state.phase, startAnimation]);

  return { animationState: state, controls };
}
