import { useState, useCallback, useRef, useEffect } from 'react';
import { estimateBarDurationMs, DAY_MS } from '../utils/barDuration';

/**
 * Pan/Zoom hook that keeps a fixed number of blank "virtual" slots after the
 * last real candle.  This gives a permanent right-hand gap without any pixel
 * offset tricks, so zooming never clips candles.
 */
/**
 * The time one virtual slot represents — ONE BAR of the timeframe, the
 * package's shared rule (utils/barDuration). Weekly was treated as daily
 * until DWLF-266 (21-Sep-2026): 90 weekly slots covered 90 days, and anything
 * drawn more than ~13 weeks past the last candle (a cycle window's close, its
 * hard max) fell off an axis no pan could reach.
 */
export function slotMsForTimeframe(timeframe) {
  return estimateBarDurationMs(timeframe);
}

/**
 * The dated blank slots after the last real candle: `count` slots starting
 * `baseOffset` bars after it, one bar of the timeframe apart. Pure, so the
 * spacing rule is testable without rendering.
 */
export function virtualSlotDates({ lastRealDate, baseOffset, count, timeframe }) {
  const slotMs = slotMsForTimeframe(timeframe);
  // Sub-daily bars keep the time of day; daily and longer are calendar dates.
  // Decided by the slot size, so it can never disagree with the spacing.
  const keepTime = slotMs < DAY_MS;
  const base = new Date(lastRealDate).getTime();
  return Array.from({ length: count }, (_, i) => {
    const iso = new Date(base + (baseOffset + i) * slotMs).toISOString();
    return {
      date: keepTime ? iso : iso.split('T')[0],
      _virtual: true
    };
  });
}

/**
 * Bars a horizontal wheel or trackpad swipe moves the window by: positive toward newer bars.
 * A wheel's deltaX is a scroll offset (positive scrolls right, the opposite sign to a drag's
 * clientX change), so a swipe moves the candles with the fingers, as a drag does.
 */
export function wheelPanBars(deltaX, pxPerBar) {
  return Math.round(deltaX / (pxPerBar * 1.5));
}

export default function useChartPanZoomVirtual(
  data,
  initialVisibleCount = 50,
  extraSlots = 30, // configurable number of blank bars
  timeframe = 'daily'
) {

  const DATA_MAX = data.length + extraSlots;

  // One state for the window, so a clamp can read the latest one (see the clamp effect).
  // Initialised anchored to the most recent candles.
  const [viewport, setViewportState] = useState(() => ({
    start: Math.max(0, DATA_MAX - initialVisibleCount),
    end: DATA_MAX
  }));
  const viewportStart = viewport.start;
  const viewportEnd = viewport.end;

  const chartElementRef = useRef();
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanX, setLastPanX] = useState(0);

  /* --------------------------- visible data --------------------------- */
  const buildVisibleData = useCallback(() => {
    const realEnd = Math.min(viewportEnd, data.length);
    const slice = data.slice(viewportStart, realEnd);

    let dummies = [];
    if (viewportEnd > data.length && data.length) {
      const firstVirtualIndex = Math.max(viewportStart, data.length);
      const dummyCount = Math.max(0, viewportEnd - firstVirtualIndex);
      const baseOffset = firstVirtualIndex - (data.length - 1);
      dummies = virtualSlotDates({
        lastRealDate: data[data.length - 1].date,
        baseOffset,
        count: dummyCount,
        timeframe
      });
    }
    return [...slice, ...dummies];
  }, [viewportStart, viewportEnd, data, timeframe]);

  const visibleData = buildVisibleData();
  const visibleCount = visibleData.length;

  /* ----------------------------- helpers ----------------------------- */
  const clampWindow = useCallback(
    (start, count) => {
      const safeCount = Math.max(0, Math.min(count, DATA_MAX));
      const s = Math.max(0, Math.min(start, DATA_MAX - safeCount));
      return { start: s, end: s + safeCount };
    },
    [DATA_MAX]
  );

  // Keeps the window inside the bars when they shrink (clampWindow changes with the bar count; every
  // pan and zoom clamps itself). A functional update, so a window placed earlier in the same commit
  // (the chart's layout effect) is clamped rather than overwritten.
  useEffect(() => {
    setViewportState(current => {
      const count = current.end - current.start;
      if (count <= 0) return current;
      const next = clampWindow(current.start, count);
      return next.start === current.start && next.end === current.end ? current : next;
    });
  }, [clampWindow]);

  /* ----------------------------- panning ----------------------------- */
  const handleMouseDown = useCallback(e => {
    setIsPanning(true);
    setLastPanX(e.clientX);
  }, []);

  const handleMouseMove = useCallback(
    e => {
      if (!isPanning) return;
      const deltaX = e.clientX - lastPanX;
      const chart = chartElementRef.current;
      if (!chart) return;

      const rect = chart.getBoundingClientRect();
      const margin = { left: 10, right: 20 }; // matches DWLFChart margin
      const chartWidth = rect.width - margin.left - margin.right;
      const pxPerBar = chartWidth / visibleCount;
      const barsDelta = Math.round(deltaX / (pxPerBar * 1.5));
      if (barsDelta !== 0) {
        const { start, end } = clampWindow(viewportStart - barsDelta, visibleCount);
        setViewportState({ start, end });
        setLastPanX(e.clientX);
      }
    },
    [isPanning, lastPanX, visibleCount, viewportStart, clampWindow]
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  /* ---------------------------- wheel pan ---------------------------- */
  const handleWheel = useCallback(
    e => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const margin = { left: 10, right: 20 };
      const chartWidth = rect.width - margin.left - margin.right;

      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (isHorizontal) {
        const pxPerBar = chartWidth / visibleCount;
        const barsDelta = wheelPanBars(e.deltaX, pxPerBar);
        if (barsDelta) {
          const { start, end } = clampWindow(viewportStart + barsDelta, visibleCount);
          setViewportState({ start, end });
        }
        return;
      }

      /* ------------------------------ zoom ----------------------------- */
      const mouseX = e.clientX - rect.left - margin.left;
      const ratioX = mouseX / chartWidth;

      const ZOOM_SENS = 0.002;
      const scale = 1 + e.deltaY * ZOOM_SENS;
      const safeScale = scale <= 0 ? 0.1 : scale;

      const newCount = Math.max(5, Math.min(DATA_MAX, Math.round(visibleCount * safeScale)));
      if (newCount === visibleCount) return;

      const centerIndex = viewportStart + ratioX * visibleCount;
      const newStart = Math.round(centerIndex - ratioX * newCount);
      const { start, end } = clampWindow(newStart, newCount);
      setViewportState({ start, end });
    },
    [visibleCount, viewportStart, clampWindow, DATA_MAX]
  );

  /* ----------------------- attach wheel listener ---------------------- */
  const setChartElementRef = useCallback(
    el => {
      if (chartElementRef.current) {
        chartElementRef.current.removeEventListener('wheel', handleWheel);
      }
      chartElementRef.current = el;
      if (el) {
        el.addEventListener('wheel', handleWheel, { passive: false });
      }
    },
    [handleWheel]
  );

  /* ------------------------- imperative API --------------------------- */
  const zoomIn = useCallback(() => {
    const newCount = Math.max(5, Math.round((viewportEnd - viewportStart) * 0.8));
    const center = (viewportStart + viewportEnd) / 2;
    const { start, end } = clampWindow(Math.round(center - newCount / 2), newCount);
    setViewportState({ start, end });
  }, [viewportStart, viewportEnd, clampWindow]);

  const zoomOut = useCallback(() => {
    const newCount = Math.min(DATA_MAX, Math.round((viewportEnd - viewportStart) * 1.25));
    const center = (viewportStart + viewportEnd) / 2;
    const { start, end } = clampWindow(Math.round(center - newCount / 2), newCount);
    setViewportState({ start, end });
  }, [viewportStart, viewportEnd, clampWindow, DATA_MAX]);

  const resetView = useCallback(() => {
    const { start, end } = clampWindow(DATA_MAX - initialVisibleCount, initialVisibleCount);
    setViewportState({ start, end });
  }, [initialVisibleCount, clampWindow, DATA_MAX]);

  // Sets the window directly, clamped like any pan; returns the window it settled on.
  const setViewport = useCallback(
    (startIndex, endIndex) => {
      const { start, end } = clampWindow(startIndex, endIndex - startIndex);
      setViewportState({ start, end });
      return { start, end };
    },
    [clampWindow]
  );

  const panToStart = useCallback(() => {
    const { start, end } = clampWindow(0, visibleCount);
    setViewportState({ start, end });
  }, [clampWindow, visibleCount]);

  const panToEnd = useCallback(() => {
    const { start, end } = clampWindow(DATA_MAX - visibleCount, visibleCount);
    setViewportState({ start, end });
  }, [clampWindow, visibleCount, DATA_MAX]);

  /* ------------------------------- API -------------------------------- */
  return {
    visibleData,
    viewportStart,
    viewportEnd,
    visibleCount,

    mouseHandlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp
    },
    chartElementRef: setChartElementRef,

    zoomIn,
    zoomOut,
    resetView,
    setViewport,
    panToStart,
    panToEnd,

    isPanning
  };
} 
