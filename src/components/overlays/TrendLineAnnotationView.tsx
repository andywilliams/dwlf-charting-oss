import React, { useCallback, useEffect, useRef } from 'react';
import type { TrendLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex, LINE_STYLE_MAP, resolveXWithExtrapolation } from './annotationUtils';
import { HANDLE_RADIUS, HANDLE_RADIUS_SMALL, HIT_AREA_WIDTH } from './annotationConstants';

export interface TrendLineAnnotationViewProps {
  annotation: TrendLineAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<TrendLineAnnotation>) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

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
    // Vertical line
    if (extendLeft) {
      const dir = y1 < y2 ? -1 : 1;
      ey1 = dir < 0 ? 0 : paneHeight;
    }
    if (extendRight) {
      const dir = y2 > y1 ? 1 : -1;
      ey2 = dir > 0 ? paneHeight : 0;
    }
    return { ex1, ey1, ex2, ey2 };
  }

  if (dy === 0) {
    // Horizontal line
    if (extendLeft) {
      const dir = x1 < x2 ? -1 : 1;
      ex1 = dir < 0 ? 0 : chartWidth;
      ey1 = y1;
    }
    if (extendRight) {
      const dir = x2 > x1 ? 1 : -1;
      ex2 = dir > 0 ? chartWidth : 0;
      ey2 = y2;
    }
    return { ex1, ey1, ex2, ey2 };
  }

  const slope = dy / dx;
  const intercept = y1 - slope * x1; // y = slope * x + intercept

  if (extendLeft) {
    // Extend from point 1 backwards (away from point 2)
    const dir = x1 < x2 ? -1 : 1; // extend away from x2
    const targetX = dir < 0 ? 0 : chartWidth;
    const targetY = slope * targetX + intercept;
    // Clamp to chart bounds
    let candX = targetX, candY = targetY;
    if (targetY < 0) {
      candX = -intercept / slope;
      candY = 0;
    } else if (targetY > paneHeight) {
      candX = (paneHeight - intercept) / slope;
      candY = paneHeight;
    }
    // Ensure extended point is actually beyond x1 in the extension direction
    if ((dir < 0 && candX <= x1) || (dir > 0 && candX >= x1)) {
      ex1 = candX;
      ey1 = candY;
    }
  }

  if (extendRight) {
    // Extend from point 2 onwards (away from point 1)
    const dir = x2 > x1 ? 1 : -1;
    const targetX = dir > 0 ? chartWidth : 0;
    const targetY = slope * targetX + intercept;
    let candX = targetX, candY = targetY;
    if (targetY < 0) {
      candX = -intercept / slope;
      candY = 0;
    } else if (targetY > paneHeight) {
      candX = (paneHeight - intercept) / slope;
      candY = paneHeight;
    }
    // Ensure extended point is actually beyond x2 in the extension direction
    if ((dir > 0 && candX >= x2) || (dir < 0 && candX <= x2)) {
      ex2 = candX;
      ey2 = candY;
    }
  }

  return { ex1, ey1, ex2, ey2 };
};

const TrendLineAnnotationView: React.FC<TrendLineAnnotationViewProps> = ({
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
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartData = useRef<{ time1: number; price1: number; time2: number; price2: number }>({
    time1: 0, price1: 0, time2: 0, price2: 0,
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
    const xScaleCurrent = xScaleRef.current;
    const yScaleCurrent = yScaleRef.current;
    const timeToIndexCurrent = timeToIndexRef.current;
    const indexToTimeCurrent = indexToTimeRef.current;
    const compressedTimesCurrent = compressedTimesRef.current;
    const dataLengthCurrent = dataLengthRef.current;

    const isCompressed = !!(timeToIndexCurrent && indexToTimeCurrent && dataLengthCurrent > 0);
    const startIndex = isCompressed ? findClosestIndex(startTime, compressedTimesCurrent, timeToIndexCurrent) : null;
    const startXValue = startIndex != null ? startIndex : startTime;
    const newX = xScaleCurrent(startXValue) + deltaX;
    const newY = yScaleCurrent.scale(startPrice) + deltaY;

    let newTime = startTime;
    if (xScaleCurrent.invert) {
      const inverted = xScaleCurrent.invert(newX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      newTime = (timeToIndexCurrent && indexToTimeCurrent && dataLengthCurrent > 0) ? indexToTimeCurrent(Math.round(rawValue)) : rawValue;
    }
    const newPrice = yScaleCurrent.invert(newY);

    return {
      time: Number.isFinite(newTime) ? newTime : startTime,
      price: Number.isFinite(newPrice) ? newPrice : startPrice,
    };
  }, []);

  // --- Endpoint 1 drag ---
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2]);

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

  // --- Whole-line drag (move both endpoints equally) ---

  const handleWholeDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const p1 = pixelToData(dragStartData.current.time1, dragStartData.current.price1, deltaX, deltaY);
    const p2 = pixelToData(dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY);
    onMove?.(annotation.id, { time1: p1.time, price1: p1.price, time2: p2.time, price2: p2.price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingWhole, handleMouseDown: handleWholeMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleWholeDragMove,
  });

  const isDragging = isDraggingP1 || isDraggingP2 || isDraggingWhole;

  // Resolve pixel positions for both endpoints
  const x1 = resolveXWithExtrapolation(
    annotation.time1,
    xScale,
    timeToIndex,
    indexToTime,
    dataLength,
    compressedTimes,
    chartWidth,
  );
  const x2 = resolveXWithExtrapolation(
    annotation.time2,
    xScale,
    timeToIndex,
    indexToTime,
    dataLength,
    compressedTimes,
    chartWidth,
  );

  if (x1 === undefined || x2 === undefined) return null;

  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);

  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;

  // Compute draw coordinates (with optional extension)
  const { ex1, ey1, ex2, ey2 } = extendLine(
    x1, y1, x2, y2, chartWidth, paneHeight,
    annotation.extendLeft, annotation.extendRight,
  );

  // Both extended points entirely outside visible area
  const bothOutsideX = (ex1 < -50 && ex2 < -50) || (ex1 > chartWidth + 50 && ex2 > chartWidth + 50);
  const bothOutsideY = (ey1 < -50 && ey2 < -50) || (ey1 > paneHeight + 50 && ey2 > paneHeight + 50);
  if (bothOutsideX || bothOutsideY) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Label at midpoint
  const labelText = annotation.label || '';
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g
      className="trendline-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <line
          x1={ex1} y1={ey1} x2={ex2} y2={ey2}
          stroke={selectionGlow}
          strokeWidth={annotation.lineWidth + 6}
          strokeLinecap="round"
        />
      )}

      {/* Hit area (invisible, wider for easier clicking) */}
      <line
        x1={ex1} y1={ey1} x2={ex2} y2={ey2}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined}
      />

      {/* Main line */}
      <line
        x1={ex1} y1={ey1} x2={ex2} y2={ey2}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Label at midpoint */}
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

      {/* Endpoint handles (when selected) */}
      {selected && (
        <>
          {/* Endpoint 1 */}
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
          {/* Endpoint 2 */}
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
          {/* Midpoint drag handle */}
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

export default TrendLineAnnotationView;
