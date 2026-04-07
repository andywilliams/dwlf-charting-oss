import React, { useCallback, useEffect, useRef } from 'react';
import type { FairValueGapAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestIndex, LINE_STYLE_MAP } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { RECT_HIT_PADDING } from './annotationConstants';

export interface FairValueGapAnnotationViewProps {
  annotation: FairValueGapAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<FairValueGapAnnotation>) => void;
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
const getColor = (annotation: FairValueGapAnnotation): string => {
  return annotation.color || DIRECTION_COLORS[annotation.direction];
};

/** Get fill opacity based on filled state */
const getFillOpacity = (annotation: FairValueGapAnnotation): number => {
  if (annotation.filled) return 0.1;
  return annotation.fillOpacity;
};

/** Get stroke opacity based on filled state */
const getStrokeOpacity = (annotation: FairValueGapAnnotation): number => {
  if (annotation.filled) return 0.3;
  return 1;
};

const FairValueGapAnnotationView: React.FC<FairValueGapAnnotationViewProps> = ({
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
    time1: number; time2: number; top: number; bottom: number;
  }>({ time1: 0, time2: 0, top: 0, bottom: 0 });
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

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartCoords.current = {
      time1: annotation.time1,
      time2: annotation.time2,
      top: annotation.top,
      bottom: annotation.bottom,
    };
  }, [annotation.time1, annotation.time2, annotation.top, annotation.bottom]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const yS = yScaleRef.current;
    const start = dragStartCoords.current;

    // Calculate new times using screenToTimeDelta (handles compressGaps properly)
    const newTime1 = screenToTimeDelta(start.time1, deltaX);
    const newTime2 = screenToTimeDelta(start.time2, deltaX);

    // Calculate new prices
    const newTop = yS.invert(yS.scale(start.top) + deltaY);
    const newBottom = yS.invert(yS.scale(start.bottom) + deltaY);

    if ([newTime1, newTime2, newTop, newBottom].every(Number.isFinite)) {
      onMove?.(annotation.id, {
        time1: newTime1,
        time2: newTime2,
        top: newTop,
        bottom: newBottom,
      });
    }
  }, [annotation.id, onMove, screenToTimeDelta]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  // Get x positions - fallback to raw timestamp when timeToIndex is not available (non-compressGaps mode)
  const getXValue = (time: number): number | undefined => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) return timeToIndex(time);
    return undefined;
  };

  const xValue1 = getXValue(annotation.time1) ?? annotation.time1;
  const xValue2 = getXValue(annotation.time2) ?? annotation.time2;

  if (!Number.isFinite(xValue1) || !Number.isFinite(xValue2)) return null;

  const x1 = xScale(xValue1);
  const x2 = xScale(xValue2);

  // Get y positions
  const yTop = yScale.scale(annotation.top);
  const yBottom = yScale.scale(annotation.bottom);

  if ([x1, x2, yTop, yBottom].some(v => !Number.isFinite(v))) return null;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(yTop, yBottom);
  const bottom = Math.max(yTop, yBottom);
  const rectWidth = right - left;
  const rectHeight = bottom - top;

  // Don't render if completely outside visible area
  if (right < -50 || left > chartWidth + 50 || bottom < -50 || top > paneHeight + 50) return null;

  const color = getColor(annotation);
  const fillOpacity = getFillOpacity(annotation);
  const strokeOpacity = getStrokeOpacity(annotation);
  const strokeDasharray = annotation.filled ? LINE_STYLE_MAP.dashed : LINE_STYLE_MAP[annotation.lineStyle];

  const selectionColor = darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)';

  const labelText = annotation.label || 'FVG';

  return (
    <g
      className="fair-value-gap-annotation"
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
          {(annotation.top - annotation.bottom).toFixed(2)}
        </text>
      )}
    </g>
  );
};

export default FairValueGapAnnotationView;