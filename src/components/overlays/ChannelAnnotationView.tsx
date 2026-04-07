import React, { useCallback, useEffect, useRef } from 'react';
import type { ChannelAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex, resolveX } from './annotationUtils';
import { HANDLE_RADIUS, HANDLE_RADIUS_SMALL, HIT_AREA_WIDTH } from './annotationConstants';

export interface ChannelAnnotationViewProps {
  annotation: ChannelAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<ChannelAnnotation>) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

const LINE_STYLE_MAP: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 4',
};

/**
 * Compute extended line endpoints beyond the segment.
 * Given two points (x1,y1) and (x2,y2), extends the line to the chart boundaries.
 */
const extendLine = (
  x1: number, y1: number,
  x2: number, y2: number,
  chartWidth: number,
  paneHeight: number,
  extendLeft: boolean,
  extendRight: boolean,
): { ex1: number; ey1: number; ex2: number; ey2: number } => {
  let ex1 = x1, ey1 = y1, ex2 = x2, ey2 = y2;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) return { ex1, ey1, ex2, ey2 };

  if (dx === 0) {
    if (extendLeft) {
      ey1 = y1 < y2 ? 0 : paneHeight;
    }
    if (extendRight) {
      ey2 = y2 > y1 ? paneHeight : 0;
    }
    return { ex1, ey1, ex2, ey2 };
  }

  const slope = dy / dx;
  const intercept = y1 - slope * x1;

  if (extendLeft) {
    const dir = x1 < x2 ? -1 : 1;
    const targetX = dir < 0 ? 0 : chartWidth;
    if (slope === 0) {
      ex1 = targetX;
      ey1 = y1;
    } else {
      const targetY = slope * targetX + intercept;
      if (targetY >= 0 && targetY <= paneHeight) {
        ex1 = targetX;
        ey1 = targetY;
      } else if (targetY < 0) {
        ex1 = -intercept / slope;
        ey1 = 0;
      } else {
        ex1 = (paneHeight - intercept) / slope;
        ey1 = paneHeight;
      }
    }
  }

  if (extendRight) {
    const dir = x2 > x1 ? 1 : -1;
    const targetX = dir > 0 ? chartWidth : 0;
    if (slope === 0) {
      ex2 = targetX;
      ey2 = y2;
    } else {
      const targetY = slope * targetX + intercept;
      if (targetY >= 0 && targetY <= paneHeight) {
        ex2 = targetX;
        ey2 = targetY;
      } else if (targetY < 0) {
        ex2 = -intercept / slope;
        ey2 = 0;
      } else {
        ex2 = (paneHeight - intercept) / slope;
        ey2 = paneHeight;
      }
    }
  }

  return { ex1, ey1, ex2, ey2 };
};

const ChannelAnnotationView: React.FC<ChannelAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onMove,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes,
}) => {
  // Which handle is being dragged: null | 1 | 2 | 'offset' | 'whole'
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartData = useRef<{
    time1: number; price1: number;
    time2: number; price2: number;
    priceOffset: number;
  }>({
    time1: 0, price1: 0, time2: 0, price2: 0, priceOffset: 0,
  });
  const xScaleRef = useRef(xScale);
  const yScaleRef = useRef(yScale);
  const timeToIndexRef = useRef(timeToIndex);
  const indexToTimeRef = useRef(indexToTime);
  const compressedTimesRef = useRef(compressedTimes);
  const dataLengthRef = useRef(dataLength);

  useEffect(() => {
    xScaleRef.current = xScale;
    yScaleRef.current = yScale;
    timeToIndexRef.current = timeToIndex;
    indexToTimeRef.current = indexToTime;
    compressedTimesRef.current = compressedTimes;
    dataLengthRef.current = dataLength;
  }, [xScale, yScale, timeToIndex, indexToTime, compressedTimes, dataLength]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  // Convert pixel deltas to data coordinates for a point
  const pixelToData = useCallback((
    startTime: number,
    startPrice: number,
    deltaX: number,
    deltaY: number,
  ): { time: number; price: number } => {
    const xs = xScaleRef.current;
    const ys = yScaleRef.current;
    const tti = timeToIndexRef.current;
    const iti = indexToTimeRef.current;
    const ct = compressedTimesRef.current;
    const dl = dataLengthRef.current;

    const startXValue = tti && iti && dl > 0
      ? (findClosestIndex(startTime, ct, tti) ?? startTime)
      : startTime;
    const newX = xs(startXValue) + deltaX;
    const newY = ys.scale(startPrice) + deltaY;

    let newTime = startTime;
    if (xs.invert) {
      const inverted = xs.invert(newX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      newTime = iti ? iti(Math.round(rawValue)) : rawValue;
    }
    const newPrice = ys.invert(newY);

    return {
      time: Number.isFinite(newTime) ? newTime : startTime,
      price: Number.isFinite(newPrice) ? newPrice : startPrice,
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
      priceOffset: annotation.priceOffset,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2, annotation.priceOffset]);

  // --- Endpoint 1 drag ---
  const handleP1DragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const { time, price } = pixelToData(
      dragStartData.current.time1, dragStartData.current.price1, deltaX, deltaY,
    );
    onMove?.(annotation.id, { time1: time, price1: price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingP1, handleMouseDown: handleP1MouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleP1DragMove,
  });

  // --- Endpoint 2 drag ---
  const handleP2DragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const { time, price } = pixelToData(
      dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY,
    );
    onMove?.(annotation.id, { time2: time, price2: price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingP2, handleMouseDown: handleP2MouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleP2DragMove,
  });

  // --- Offset handle drag (adjusts priceOffset by dragging midpoint of parallel line) ---
  const handleOffsetDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const ys = yScaleRef.current;
    // Convert pixel delta to price delta
    const startOffsetPrice = dragStartData.current.price1 + dragStartData.current.priceOffset;
    const startOffsetY = ys.scale(startOffsetPrice);
    const newOffsetPrice = ys.invert(startOffsetY + deltaY);
    if (Number.isFinite(newOffsetPrice)) {
      const newOffset = newOffsetPrice - dragStartData.current.price1;
      onMove?.(annotation.id, { priceOffset: newOffset });
    }
  }, [annotation.id, onMove]);

  const { isDragging: isDraggingOffset, handleMouseDown: handleOffsetMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleOffsetDragMove,
  });

  // --- Whole-channel drag (move all points equally) ---
  const handleWholeDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const p1 = pixelToData(dragStartData.current.time1, dragStartData.current.price1, deltaX, deltaY);
    const p2 = pixelToData(dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY);
    onMove?.(annotation.id, {
      time1: p1.time, price1: p1.price,
      time2: p2.time, price2: p2.price,
    });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingWhole, handleMouseDown: handleWholeMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleWholeDragMove,
  });

  const isDragging = isDraggingP1 || isDraggingP2 || isDraggingOffset || isDraggingWhole;

  // Resolve pixel positions for base line endpoints
  const x1 = resolveX(annotation.time1, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x2 = resolveX(annotation.time2, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);

  if (x1 === undefined || x2 === undefined) return null;

  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);

  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;

  // Parallel line Y positions (same X, shifted Y by priceOffset)
  const py1 = yScale.scale(annotation.price1 + annotation.priceOffset);
  const py2 = yScale.scale(annotation.price2 + annotation.priceOffset);

  if (!Number.isFinite(py1) || !Number.isFinite(py2)) return null;

  // Both lines entirely outside visible area
  const allOutsideX = (x1 < -50 && x2 < -50) || (x1 > chartWidth + 50 && x2 > chartWidth + 50);
  if (allOutsideX) return null;

  // Compute draw coordinates (with optional extension)
  const base = extendLine(x1, y1, x2, y2, chartWidth, paneHeight, annotation.extendLeft, annotation.extendRight);
  const parallel = extendLine(x1, py1, x2, py2, chartWidth, paneHeight, annotation.extendLeft, annotation.extendRight);

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Label at midpoint of base line
  const labelText = annotation.label || '';
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // Midpoint of parallel line (for offset handle)
  const midPY = (py1 + py2) / 2;

  // Fill polygon: base line extended endpoints + parallel line extended endpoints (reversed)
  const fillPoints = `${base.ex1},${base.ey1} ${base.ex2},${base.ey2} ${parallel.ex2},${parallel.ey2} ${parallel.ex1},${parallel.ey1}`;

  return (
    <g
      className="channel-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Semi-transparent fill between the two lines */}
      <polygon
        points={fillPoints}
        fill={annotation.color}
        fillOpacity={annotation.fillOpacity}
        stroke="none"
        onMouseDown={selected ? handleWholeMouseDown : undefined}
        style={{ cursor: selected ? 'grab' : 'pointer' }}
      />

      {/* Selection glow — base line */}
      {selected && (
        <>
          <line
            x1={base.ex1} y1={base.ey1} x2={base.ex2} y2={base.ey2}
            stroke={selectionGlow}
            strokeWidth={annotation.lineWidth + 6}
            strokeLinecap="round"
          />
          <line
            x1={parallel.ex1} y1={parallel.ey1} x2={parallel.ex2} y2={parallel.ey2}
            stroke={selectionGlow}
            strokeWidth={annotation.lineWidth + 6}
            strokeLinecap="round"
          />
        </>
      )}

      {/* Hit area — base line (invisible, wider for easier clicking) */}
      <line
        x1={base.ex1} y1={base.ey1} x2={base.ex2} y2={base.ey2}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined}
      />

      {/* Hit area — parallel line */}
      <line
        x1={parallel.ex1} y1={parallel.ey1} x2={parallel.ex2} y2={parallel.ey2}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined}
      />

      {/* Main base line */}
      <line
        x1={base.ex1} y1={base.ey1} x2={base.ex2} y2={base.ey2}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Parallel line */}
      <line
        x1={parallel.ex1} y1={parallel.ey1} x2={parallel.ex2} y2={parallel.ey2}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Label at midpoint of base line */}
      {labelText && (
        <g>
          <rect
            x={midX - labelText.length * 3.5 - 8}
            y={midY - 10}
            width={Math.max(30, labelText.length * 7 + 16)}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={midX}
            y={midY}
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {labelText}
          </text>
        </g>
      )}

      {/* Handles (when selected) */}
      {selected && (
        <>
          {/* Base endpoint 1 */}
          <circle
            cx={x1} cy={y1}
            r={HANDLE_RADIUS}
            fill={handleColor}
            fillOpacity={0.9}
            stroke={annotation.color}
            strokeWidth={2}
            onMouseDown={handleP1MouseDown}
            style={{ cursor: 'move' }}
          />
          {/* Base endpoint 2 */}
          <circle
            cx={x2} cy={y2}
            r={HANDLE_RADIUS}
            fill={handleColor}
            fillOpacity={0.9}
            stroke={annotation.color}
            strokeWidth={2}
            onMouseDown={handleP2MouseDown}
            style={{ cursor: 'move' }}
          />
          {/* Offset handle (midpoint of parallel line) */}
          <circle
            cx={midX} cy={midPY}
            r={HANDLE_RADIUS}
            fill={annotation.color}
            fillOpacity={0.8}
            stroke={handleColor}
            strokeWidth={2}
            onMouseDown={handleOffsetMouseDown}
            style={{ cursor: 'ns-resize' }}
          />
          {/* Midpoint drag handle for whole channel */}
          <circle
            cx={midX} cy={midY}
            r={HANDLE_RADIUS_SMALL}
            fill={annotation.color}
            fillOpacity={0.6}
            onMouseDown={handleWholeMouseDown}
            style={{ cursor: 'grab' }}
          />
        </>
      )}
    </g>
  );
};

export default ChannelAnnotationView;
