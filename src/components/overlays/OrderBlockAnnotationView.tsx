import React, { useCallback, useEffect, useRef } from 'react';
import type { OrderBlockAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestIndex, LINE_STYLE_MAP } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { RECT_HIT_PADDING } from './annotationConstants';

export interface OrderBlockAnnotationViewProps {
  annotation: OrderBlockAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<OrderBlockAnnotation>) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

/** Default colors based on direction */
const DIRECTION_COLORS = {
  bullish: '#22c55e',
  bearish: '#ef4444',
};

/** Get color based on direction or use provided color */
const getColor = (annotation: OrderBlockAnnotation): string => {
  return annotation.color || DIRECTION_COLORS[annotation.direction];
};

/** Get fill opacity based on state */
const getFillOpacity = (annotation: OrderBlockAnnotation): number => {
  if (annotation.state === 'mitigated') return 0.15;
  if (annotation.state === 'tested') return annotation.fillOpacity * 0.7;
  return annotation.fillOpacity;
};

/** Get stroke opacity based on state */
const getStrokeOpacity = (annotation: OrderBlockAnnotation): number => {
  if (annotation.state === 'mitigated') return 0.3;
  return 1;
};

const OrderBlockAnnotationView: React.FC<OrderBlockAnnotationViewProps> = ({
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
  const dragStartCoords = useRef<{
    time: number; high: number; low: number;
  }>({ time: 0, high: 0, low: 0 });
  const yScaleRef = useRef(yScale);
  const xScaleRef = useRef(xScale);
  const timeToIndexRef = useRef(timeToIndex);
  const indexToTimeRef = useRef(indexToTime);
  const compressedTimesRef = useRef(compressedTimes);
  const dataLengthRef = useRef(dataLength);

  useEffect(() => {
    yScaleRef.current = yScale;
    xScaleRef.current = xScale;
    timeToIndexRef.current = timeToIndex;
    indexToTimeRef.current = indexToTime;
    compressedTimesRef.current = compressedTimes;
    dataLengthRef.current = dataLength;
  }, [yScale, xScale, timeToIndex, indexToTime, compressedTimes, dataLength]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartCoords.current = {
      time: annotation.time,
      high: annotation.high,
      low: annotation.low,
    };
  }, [annotation.time, annotation.high, annotation.low]);

  /** Convert a screen pixel delta to a time delta, handling compressGaps mode */
  const screenToTimeDelta = useCallback((startTime: number, deltaX: number): number => {
    const xS = xScaleRef.current;
    const t2i = timeToIndexRef.current;
    const i2t = indexToTimeRef.current;
    const ct = compressedTimesRef.current;
    const dlCurrent = dataLengthRef.current;

    const startXValue = (t2i && i2t && dlCurrent > 0 && ct)
      ? ((t2i(startTime) !== undefined ? t2i(startTime) : (t2i(findClosestTime(ct, startTime)) ?? startTime)))
      : startTime;
    const newX = xS(startXValue as number) + deltaX;
    if (!xS.invert) return startTime;
    const inverted = xS.invert(newX);
    const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
    return (t2i && i2t && dlCurrent > 0 && ct) ? i2t(Math.round(rawValue)) : rawValue;
  }, []);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const yS = yScaleRef.current;
    const start = dragStartCoords.current;

    // Calculate new time using screenToTimeDelta (handles compressGaps properly)
    const newTime = screenToTimeDelta(start.time, deltaX);

    // Calculate new prices
    const newHigh = yS.invert(yS.scale(start.high) + deltaY);
    const newLow = yS.invert(yS.scale(start.low) + deltaY);

    if ([newTime, newHigh, newLow].every(Number.isFinite)) {
      onMove?.(annotation.id, {
        time: newTime,
        high: newHigh,
        low: newLow,
      });
    }
  }, [annotation.id, onMove, screenToTimeDelta]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  // Get x position - use closest-index fallback for compressGaps mode
  const getXValue = (time: number): number | undefined => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) return timeToIndex(time);
    return undefined;
  };

  const xValue = getXValue(annotation.time);
  const x = xScale(xValue ?? annotation.time);

  // Get y positions (note: high is visually higher, so lower y value)
  const yHigh = yScale.scale(annotation.high);
  const yLow = yScale.scale(annotation.low);

  if ([x, yHigh, yLow].some(v => !Number.isFinite(v))) return null;

  const left = x - 20; // Draw as a narrow zone around the candle time
  const right = x + 20;
  const top = Math.min(yHigh, yLow);
  const bottom = Math.max(yHigh, yLow);
  const rectWidth = right - left;
  const rectHeight = bottom - top;

  // Don't render if completely outside visible area
  if (right < -50 || left > chartWidth + 50 || bottom < -50 || top > paneHeight + 50) return null;

  const color = getColor(annotation);
  const fillOpacity = getFillOpacity(annotation);
  const strokeOpacity = getStrokeOpacity(annotation);
  const strokeDasharray = annotation.state === 'tested' ? LINE_STYLE_MAP.dashed : LINE_STYLE_MAP[annotation.lineStyle];

  const selectionColor = darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)';

  const labelText = annotation.label || (annotation.direction === 'bullish' ? 'Buy OB' : 'Sell OB');

  return (
    <g
      className="order-block-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <rect
          x={left - 3}
          y={top - 3}
          width={rectWidth + 6}
          height={rectHeight + 6}
          fill="none"
          stroke={selectionColor}
          strokeWidth={3}
          rx={2}
        />
      )}

      {/* Hit area (invisible, slightly larger for easier clicking) */}
      <rect
        x={left - RECT_HIT_PADDING}
        y={top - RECT_HIT_PADDING}
        width={rectWidth + RECT_HIT_PADDING * 2}
        height={rectHeight + RECT_HIT_PADDING * 2}
        fill="transparent"
        stroke="transparent"
        strokeWidth={RECT_HIT_PADDING}
        style={{ cursor: 'pointer' }}
      />

      {/* Semi-transparent fill */}
      <rect
        x={left}
        y={top}
        width={rectWidth}
        height={rectHeight}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeOpacity={strokeOpacity}
        rx={1}
        onMouseDown={selected ? handleMouseDown : undefined}
        style={{ cursor: selected ? (isDragging ? 'grabbing' : 'move') : 'pointer' }}
      />

      {/* Label */}
      {labelText && (
        <g>
          <rect
            x={left + 2}
            y={top + 2}
            width={Math.max(50, labelText.length * 7)}
            height={16}
            fill={color}
            fillOpacity={0.9}
            rx={2}
          />
          <text
            x={left + 2 + Math.max(50, labelText.length * 7) / 2}
            y={top + 10}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fill="white"
            fontWeight={600}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {labelText}
          </text>
        </g>
      )}

      {/* Price range display when selected */}
      {selected && (
        <text
          x={right - 4}
          y={bottom - 4}
          fontSize={9}
          fill={darkMode ? '#94a3b8' : '#64748b'}
          textAnchor="end"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {(annotation.high - annotation.low).toFixed(2)}
        </text>
      )}
    </g>
  );
};

export default OrderBlockAnnotationView;