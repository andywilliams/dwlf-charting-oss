import { useState, useCallback, useRef } from 'react';

/**
 * Hook for handling chart panning and zooming
 * @param {Array} data - Full dataset
 * @param {number} initialVisibleCount - Initial number of visible data points
 * @returns {Object} - Viewport state and handlers
 */
export default function useChartPanZoom(data, initialVisibleCount = 50) {
  // Viewport state - tracks which portion of data is visible
  const [viewportStart, setViewportStart] = useState(Math.max(0, data.length - initialVisibleCount));
  const [viewportEnd, setViewportEnd] = useState(data.length);
  
  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanX, setLastPanX] = useState(0);
  // Pixel offset when the user pans beyond data edges (visual blank space)
  const [pixelOffset, setPixelOffset] = useState(0);
  
  const chartElementRef = useRef();
  
  // Calculate visible data slice
  const visibleData = data.slice(viewportStart, viewportEnd);
  const visibleCount = viewportEnd - viewportStart;
  
  // Pan handlers
  const handleMouseDown = useCallback((event) => {
    setIsPanning(true);
    setLastPanX(event.clientX);
    event.preventDefault();
  }, []);
  
  const handleMouseMove = useCallback((event) => {
    if (!isPanning) return;
    
    const deltaX = event.clientX - lastPanX;
    
    // Get actual chart dimensions for more accurate panning
    const chartElement = chartElementRef.current;
    if (!chartElement) return;
    
    const rect = chartElement.getBoundingClientRect();
    const margin = { left: 50, right: 20 };
    const chartWidth = rect.width - margin.left - margin.right;
    const pixelsPerDataPoint = chartWidth / visibleCount;
    
    // Helper values for slack behaviour
    const maxOffset = chartWidth - pixelsPerDataPoint; // full view width minus 1 candle
    const clampOffset = (offset) => Math.max(-maxOffset, Math.min(0, offset));

    let remainingDeltaX = deltaX; // pixels still to handle after slack actions

    // -------- SLACK HANDLING --------
    const atRightEdge = viewportEnd >= data.length;
    // const atLeftEdge  = viewportStart <= 0; // not needed for slack accumulation anymore

    // 1. If we already have slack (pixelOffset ≠ 0) and the user drags back toward zero, eat that distance first.
    if (pixelOffset !== 0 && Math.sign(deltaX) !== Math.sign(pixelOffset)) {
      const desiredOffset = pixelOffset + deltaX;
      const clampedOffset = clampOffset(desiredOffset);
      const consumed = clampedOffset - pixelOffset; // will reduce magnitude of offset
      setPixelOffset(clampedOffset);
      remainingDeltaX = deltaX - consumed;
    }

    // 2. If we're at an edge and moving further outwards, accumulate more slack.
    if (atRightEdge && remainingDeltaX < 0) {
      const desiredOffset = pixelOffset + remainingDeltaX;
      const clampedOffset = clampOffset(desiredOffset);
      const consumed = clampedOffset - pixelOffset;
      setPixelOffset(clampedOffset);
      remainingDeltaX -= consumed;
    }

    // If there are still pixels left after slack (or we weren't at the edge), convert to data movement
    if (remainingDeltaX !== 0) {
      const dataPointsDelta = Math.round(remainingDeltaX / (pixelsPerDataPoint * 1.5));

      if (dataPointsDelta !== 0) {
        const newStart = Math.max(0, viewportStart - dataPointsDelta);
        const newEnd = Math.min(data.length, newStart + visibleCount);
        const adjustedStart = Math.max(0, newEnd - visibleCount);

        setViewportStart(adjustedStart);
        setViewportEnd(newEnd);
        setPixelOffset(0); // clear slack once we move the window
      }
    }

    // If we've moved the data window away from the right edge, clear any negative offset
    if (viewportEnd < data.length && pixelOffset !== 0) {
      setPixelOffset(0);
    }

    setLastPanX(event.clientX);
  }, [isPanning, lastPanX, viewportStart, visibleCount, pixelOffset, data.length]);
  
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);
  
  // Zoom handler - direct zoom without inertia
  const handleWheel = useCallback((event) => {
    event.preventDefault();
    
    // Determine whether this wheel gesture should pan (horizontal) or zoom (vertical)
    const isHorizontalPan = Math.abs(event.deltaX) > Math.abs(event.deltaY);

    // Calculate chart layout info needed for both pan & zoom
    const rect = event.currentTarget.getBoundingClientRect();
    const margin = { left: 50, right: 20 };
    const chartWidth = rect.width - margin.left - margin.right;

    if (isHorizontalPan) {
      // -----------------------------
      // Horizontal track-pad scroll → Pan
      // -----------------------------
      const pixelsPerDataPoint = chartWidth / visibleCount;

      // Use a sensitivity factor so small accidental scrolls do not shift the chart too much.
      // Re-use the same 1.5 factor that drag-panning uses for consistency.
      const dataPointsDelta = Math.round(event.deltaX / (pixelsPerDataPoint * 1.5));

      if (dataPointsDelta !== 0) {
        const newStart = Math.max(0, viewportStart - dataPointsDelta);
        const newEnd = Math.min(data.length, newStart + visibleCount);
        const adjustedStart = Math.max(0, newEnd - visibleCount);
        setViewportStart(adjustedStart);
        setViewportEnd(newEnd);
        setPixelOffset(0);
      }
      return; // We handled horizontal pan, no zoom processing
    }

    // -----------------------------
    // Vertical wheel / track-pad scroll → Zoom
    // -----------------------------
    // Where is the mouse relative to chart? – so we can zoom around that point
    const mouseX = event.clientX - rect.left;
    // Account for current horizontal offset so zoom centres correctly even with slack
    const relativeX = (mouseX - margin.left - pixelOffset) / chartWidth;
    const mouseDataIndex = viewportStart + (relativeX * visibleCount);

    const currentCount = viewportEnd - viewportStart;

    // Multiplicative scaling: newCount = currentCount * scale
    // Small sensitivity for smooth control: 0.002 gives ~20 % change for a large 100-unit wheel delta
    const ZOOM_SENSITIVITY = 0.002;
    const scale = 1 + event.deltaY * ZOOM_SENSITIVITY;

    // Guard against negative or zero scale (extreme upward scroll)
    const safeScale = scale <= 0 ? 0.1 : scale;

    let newCount = Math.round(currentCount * safeScale);

    // Clamp
    const MIN_VISIBLE = 5;
    newCount = Math.max(MIN_VISIBLE, Math.min(data.length, newCount));

    // If nothing changes, exit early to avoid feedback
    if (newCount === currentCount) return;

    // Center around the mouse focal point, but clamp to data bounds
    const centerPoint = Math.max(0, Math.min(data.length - 1, mouseDataIndex));
    let newStart = centerPoint - (newCount * relativeX);
    newStart = Math.max(0, Math.min(data.length - newCount, newStart));
    const newEnd = newStart + newCount;

    setViewportStart(Math.floor(newStart));
    setViewportEnd(Math.floor(newEnd));

    // Scale existing slack so its visual width stays roughly constant after zoom
    const currentPixelsPerDataPoint = chartWidth / currentCount;
    const newPixelsPerDataPoint = chartWidth / newCount;

    let proposedOffset = pixelOffset * (newPixelsPerDataPoint / currentPixelsPerDataPoint);

    // Candle body width roughly 70% of spacing (matching getCandleProps)
    const candleWidth = newPixelsPerDataPoint * 0.7;

    // Allow slack up to the point where the full last candle is still visible
    const newMaxOffset = chartWidth - candleWidth;
    const clampedOffset = Math.max(-newMaxOffset, Math.min(0, proposedOffset));

    if (clampedOffset !== pixelOffset) {
      setPixelOffset(clampedOffset);
    }
  }, [viewportStart, viewportEnd, visibleCount, data.length, pixelOffset]);

  // Callback ref to set up non-passive wheel event listener
  const setChartElementRef = useCallback((element) => {
    // Remove previous listener if any
    if (chartElementRef.current) {
      chartElementRef.current.removeEventListener('wheel', handleWheel);
    }
    
    // Set the new ref
    chartElementRef.current = element;
    
    // Add listener to new element
    if (element) {
      element.addEventListener('wheel', handleWheel, { passive: false });
    }
  }, [handleWheel]);
  
  // Mouse event handlers object (excluding onWheel since we handle it manually)
  const mouseHandlers = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseUp, // Stop panning if mouse leaves
  };
  
  // Utility functions
  const zoomIn = useCallback(() => {
    const currentCount = viewportEnd - viewportStart;
    const centerPoint = (viewportStart + viewportEnd) / 2;
    const newCount = Math.max(10, currentCount * 0.8); // Zoom in by 20%
    
    const newStart = Math.max(0, centerPoint - newCount / 2);
    const newEnd = Math.min(data.length, newStart + newCount);
    
    setViewportStart(Math.floor(newStart));
    setViewportEnd(Math.floor(newEnd));
  }, [viewportStart, viewportEnd, data.length]);
  
  const zoomOut = useCallback(() => {
    const currentCount = viewportEnd - viewportStart;
    const centerPoint = (viewportStart + viewportEnd) / 2;
    const newCount = Math.min(data.length, currentCount * 1.25); // Zoom out by 25%
    
    const newStart = Math.max(0, centerPoint - newCount / 2);
    const newEnd = Math.min(data.length, newStart + newCount);
    
    setViewportStart(Math.floor(newStart));
    setViewportEnd(Math.floor(newEnd));
  }, [viewportStart, viewportEnd, data.length]);
  
  const resetView = useCallback(() => {
    setViewportStart(Math.max(0, data.length - initialVisibleCount));
    setViewportEnd(data.length);
    setPixelOffset(0);
  }, [data.length, initialVisibleCount]);
  
  const panToStart = useCallback(() => {
    setViewportStart(0);
    setViewportEnd(Math.min(data.length, visibleCount));
  }, [data.length, visibleCount]);
  
  const panToEnd = useCallback(() => {
    setViewportStart(Math.max(0, data.length - visibleCount));
    setViewportEnd(data.length);
  }, [data.length, visibleCount]);
  
  return {
    // Viewport data
    visibleData,
    viewportStart,
    viewportEnd,
    visibleCount,
    
    // Mouse handlers
    mouseHandlers,
    
    // Callback ref for chart element (needed for non-passive wheel events)
    chartElementRef: setChartElementRef,
    
    // Programmatic controls
    zoomIn,
    zoomOut,
    resetView,
    panToStart,
    panToEnd,
    
    // State
    isPanning,
    pixelOffset,
  };
} 