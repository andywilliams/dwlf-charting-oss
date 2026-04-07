import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Pan/Zoom hook that keeps a fixed number of blank "virtual" slots after the
 * last real candle.  This gives a permanent right-hand gap without any pixel
 * offset tricks, so zooming never clips candles.
 */
export default function useChartPanZoomVirtual(
  data,
  initialVisibleCount = 50,
  extraSlots = 30, // configurable number of blank bars
  timeframe = 'daily'
) {
  const lowerTf = (timeframe || '').toLowerCase();
  const SLOT_MS = lowerTf === 'hourly' ? 3_600_000 : 86_400_000; // 1 hour vs 1 day spacing

  const DATA_MAX = data.length + extraSlots;

  // Initialise viewport anchored to the most recent candles
  const [viewportStart, setViewportStart] = useState(() =>
    Math.max(0, DATA_MAX - initialVisibleCount)
  );
  const [viewportEnd, setViewportEnd] = useState(DATA_MAX);

  const chartElementRef = useRef();
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanX, setLastPanX] = useState(0);

  /* --------------------------- visible data --------------------------- */
  const buildVisibleData = useCallback(() => {
    const realEnd = Math.min(viewportEnd, data.length);
    const slice = data.slice(viewportStart, realEnd);

    let dummies = [];
    if (viewportEnd > data.length && data.length) {
      const lastRealDate = new Date(data[data.length - 1].date);
      const firstVirtualIndex = Math.max(viewportStart, data.length);
      const dummyCount = Math.max(0, viewportEnd - firstVirtualIndex);
      const baseOffset = firstVirtualIndex - (data.length - 1);
      dummies = Array.from({ length: dummyCount }, (_, i) => {
        const offset = baseOffset + i;
        const nextDate = new Date(lastRealDate.getTime() + offset * SLOT_MS);
        const iso = nextDate.toISOString();
        return {
          date: lowerTf === 'hourly' ? iso : iso.split('T')[0],
          _virtual: true
        };
      });
    }
    return [...slice, ...dummies];
  }, [viewportStart, viewportEnd, data, lowerTf, SLOT_MS]);

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

  useEffect(() => {
    const count = viewportEnd - viewportStart;
    if (count <= 0) return;
    const { start, end } = clampWindow(viewportStart, count);
    if (start !== viewportStart) setViewportStart(start);
    if (end !== viewportEnd) setViewportEnd(end);
  }, [clampWindow, viewportStart, viewportEnd]);

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
        setViewportStart(start);
        setViewportEnd(end);
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
        const barsDelta = Math.round(e.deltaX / (pxPerBar * 1.5));
        if (barsDelta) {
          const { start, end } = clampWindow(viewportStart - barsDelta, visibleCount);
          setViewportStart(start);
          setViewportEnd(end);
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
      setViewportStart(start);
      setViewportEnd(end);
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
    setViewportStart(start);
    setViewportEnd(end);
  }, [viewportStart, viewportEnd, clampWindow]);

  const zoomOut = useCallback(() => {
    const newCount = Math.min(DATA_MAX, Math.round((viewportEnd - viewportStart) * 1.25));
    const center = (viewportStart + viewportEnd) / 2;
    const { start, end } = clampWindow(Math.round(center - newCount / 2), newCount);
    setViewportStart(start);
    setViewportEnd(end);
  }, [viewportStart, viewportEnd, clampWindow, DATA_MAX]);

  const resetView = useCallback(() => {
    const { start, end } = clampWindow(DATA_MAX - initialVisibleCount, initialVisibleCount);
    setViewportStart(start);
    setViewportEnd(end);
  }, [initialVisibleCount, clampWindow, DATA_MAX]);

  const panToStart = useCallback(() => {
    const { start, end } = clampWindow(0, visibleCount);
    setViewportStart(start);
    setViewportEnd(end);
  }, [clampWindow, visibleCount]);

  const panToEnd = useCallback(() => {
    const { start, end } = clampWindow(DATA_MAX - visibleCount, visibleCount);
    setViewportStart(start);
    setViewportEnd(end);
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
    panToStart,
    panToEnd,

    isPanning
  };
} 
