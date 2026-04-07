import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  MeasureAnnotation,
  PaneComputedScale,
  XScale,
} from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex, resolveX } from './annotationUtils';
import { HANDLE_RADIUS, HANDLE_RADIUS_SMALL } from './annotationConstants';

export interface MeasureAnnotationViewProps {
  annotation: MeasureAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<MeasureAnnotation>) => void;
  /** Current chart timeframe for bar count estimation */
  currentTimeframe?: string;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Estimate the approximate duration of one bar in milliseconds from timeframe string */
const estimateBarDurationMs = (timeframe: string | undefined): number => {
  if (!timeframe) return 86400000; // default daily
  const tf = timeframe.toLowerCase();
  if (tf.includes('1m') && !tf.includes('1mo')) return 60000;
  if (tf.includes('5m')) return 300000;
  if (tf.includes('15m')) return 900000;
  if (tf.includes('30m')) return 1800000;
  if (tf.includes('hour') || tf === '1h' || tf === '60m') return 3600000;
  if (tf.includes('4h')) return 14400000;
  if (tf.includes('week')) return 604800000;
  if (tf.includes('month') || tf.includes('1mo')) return 2592000000;
  return 86400000; // daily
};

/** Format a time duration to a human-readable string */
const formatTimeDiff = (ms: number): string => {
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const hours = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);

  if (days > 0) {
    const remainingHours = hours - days * 24;
    if (remainingHours > 0 && days < 7) {
      return `${days}d ${remainingHours}h`;
    }
    return `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes - hours * 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }
  return `${minutes}m`;
};

/** Format a price to appropriate decimal places */
const formatPrice = (price: number): string => {
  if (Math.abs(price) < 0.01) return price.toPrecision(3);
  if (Math.abs(price) < 1) return price.toPrecision(4);
  if (Math.abs(price) < 10) return price.toFixed(4);
  if (Math.abs(price) < 1000) return price.toFixed(2);
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Format percentage with sign */
const formatPercent = (pct: number): string => {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
};

// ─── Component ───────────────────────────────────────────────────────

const MeasureAnnotationView: React.FC<MeasureAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onMove,
  currentTimeframe,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes,
}) => {
  // Drag handling refs and state
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

  // Convert pixel deltas to data coordinates
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

  // Drag start handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2]);

  // Point 1 drag handler
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

  // Point 2 drag handler
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

  // Whole annotation drag handler
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
  // Resolve pixel positions
  const x1 = resolveX(annotation.time1, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x2 = resolveX(annotation.time2, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);

  const measurements = useMemo(() => {
    const priceDiff = annotation.price2 - annotation.price1;
    const pricePct = annotation.price1 !== 0 ? (priceDiff / annotation.price1) * 100 : 0;
    const timeDiffMs = Math.abs(annotation.time2 - annotation.time1);
    const barDuration = estimateBarDurationMs(currentTimeframe);
    const barCount = Math.max(1, Math.round(timeDiffMs / barDuration));
    const timeStr = formatTimeDiff(timeDiffMs);
    const isPositive = priceDiff >= 0;

    return {
      priceDiff,
      pricePct,
      timeDiffMs,
      barCount,
      timeStr,
      isPositive,
    };
  }, [annotation.price1, annotation.price2, annotation.time1, annotation.time2, currentTimeframe]);

  if (x1 === undefined || x2 === undefined) return null;

  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;

  const { priceDiff, pricePct, barCount, timeStr, isPositive } = measurements;

  // Rectangle bounds
  const rectLeft = Math.min(x1, x2);
  const rectRight = Math.max(x1, x2);
  const rectTop = Math.min(y1, y2);
  const rectBottom = Math.max(y1, y2);
  const rectWidth = Math.max(rectRight - rectLeft, 1);
  const rectHeight = Math.max(rectBottom - rectTop, 1);

  // Colors
  const fillColor = isPositive ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)';
  const borderColor = isPositive ? '#22c55e' : '#ef4444';
  const textColor = isPositive ? '#4ade80' : '#f87171';
  const bgColor = darkMode ? 'rgba(23, 23, 23, 0.92)' : 'rgba(30, 30, 30, 0.92)';

  // Info box content
  const priceDiffStr = `${priceDiff >= 0 ? '+' : ''}${formatPrice(priceDiff)}`;
  const pctStr = formatPercent(pricePct);
  const barStr = `${barCount} bar${barCount !== 1 ? 's' : ''}`;
  const line1 = `${priceDiffStr}  (${pctStr})`;
  const line2 = `${barStr}  •  ${timeStr}`;

  // Info box sizing
  const infoFontSize = 11;
  const lineHeight = 16;
  const infoWidth = Math.max(line1.length, line2.length) * 6.5 + 24;
  const infoHeight = lineHeight * 2 + 14;

  // Position info box at center of the rectangle
  const infoCx = (rectLeft + rectRight) / 2;
  const infoCy = (rectTop + rectBottom) / 2;

  // Clamp info box within chart bounds
  let infoX = infoCx - infoWidth / 2;
  let infoY = infoCy - infoHeight / 2;
  if (infoX < 4) infoX = 4;
  if (infoX + infoWidth > chartWidth - 4) infoX = chartWidth - infoWidth - 4;
  if (infoY < 4) infoY = 4;
  if (infoY + infoHeight > paneHeight - 4) infoY = paneHeight - infoHeight - 4;

  // Selection glow color
  const selectionGlow = selected ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)') : 'transparent';
  const handleColor = selected ? (darkMode ? '#63b3ed' : '#3b82f6') : borderColor;

  return (
    <g 
      className="measure-annotation" 
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow for rectangle */}
      {selected && (
        <rect
          x={rectLeft - 3}
          y={rectTop - 3}
          width={rectWidth + 6}
          height={rectHeight + 6}
          fill="none"
          stroke={selectionGlow}
          strokeWidth={4}
          strokeDasharray="6 3"
          opacity={0.8}
        />
      )}

      {/* Selection glow for diagonal line */}
      {selected && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={selectionGlow}
          strokeWidth={7}
          opacity={0.6}
        />
      )}

      {/* Hit area for whole annotation drag (invisible, larger area) */}
      <rect
        x={rectLeft}
        y={rectTop}
        width={rectWidth}
        height={rectHeight}
        fill="transparent"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleWholeMouseDown}
      />

      {/* Semi-transparent fill rectangle */}
      <rect
        x={rectLeft}
        y={rectTop}
        width={rectWidth}
        height={rectHeight}
        fill={fillColor}
        stroke={borderColor}
        strokeWidth={1}
        strokeDasharray="6 3"
        style={{ pointerEvents: 'none' }}
      />

      {/* Diagonal line from point1 to point2 */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={borderColor}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />

      {/* Endpoint 1 marker with drag handle */}
      <circle 
        cx={x1} 
        cy={y1} 
        r={selected ? HANDLE_RADIUS : HANDLE_RADIUS_SMALL} 
        fill={handleColor} 
        fillOpacity={0.9}
        stroke={selected ? (darkMode ? '#1e293b' : '#f8fafc') : 'none'}
        strokeWidth={selected ? 2 : 0}
        style={{ cursor: isDraggingP1 ? 'grabbing' : 'grab' }}
        onMouseDown={handleP1MouseDown}
      />

      {/* Endpoint 2 marker with drag handle */}
      <circle 
        cx={x2} 
        cy={y2} 
        r={selected ? HANDLE_RADIUS : HANDLE_RADIUS_SMALL} 
        fill={handleColor} 
        fillOpacity={0.9}
        stroke={selected ? (darkMode ? '#1e293b' : '#f8fafc') : 'none'}
        strokeWidth={selected ? 2 : 0}
        style={{ cursor: isDraggingP2 ? 'grabbing' : 'grab' }}
        onMouseDown={handleP2MouseDown}
      />

      {/* Horizontal dashed lines at both price levels */}
      <line
        x1={rectLeft}
        y1={y1}
        x2={rectRight}
        y2={y1}
        stroke={borderColor}
        strokeWidth={0.5}
        strokeDasharray="3 3"
        opacity={0.4}
        style={{ pointerEvents: 'none' }}
      />
      <line
        x1={rectLeft}
        y1={y2}
        x2={rectRight}
        y2={y2}
        stroke={borderColor}
        strokeWidth={0.5}
        strokeDasharray="3 3"
        opacity={0.4}
        style={{ pointerEvents: 'none' }}
      />

      {/* Vertical dashed lines at both time levels */}
      <line
        x1={x1}
        y1={rectTop}
        x2={x1}
        y2={rectBottom}
        stroke={borderColor}
        strokeWidth={0.5}
        strokeDasharray="3 3"
        opacity={0.4}
        style={{ pointerEvents: 'none' }}
      />
      <line
        x1={x2}
        y1={rectTop}
        x2={x2}
        y2={rectBottom}
        stroke={borderColor}
        strokeWidth={0.5}
        strokeDasharray="3 3"
        opacity={0.4}
        style={{ pointerEvents: 'none' }}
      />

      {/* Info box (keep pointerEvents: 'none' so it doesn't interfere with clicking) */}
      <g style={{ pointerEvents: 'none' }}>
        {/* Info box background */}
        <rect
          x={infoX}
          y={infoY}
          width={infoWidth}
          height={infoHeight}
          fill={bgColor}
          rx={6}
          stroke={borderColor}
          strokeWidth={1}
          strokeOpacity={0.6}
        />

        {/* Price diff line */}
        <text
          x={infoX + infoWidth / 2}
          y={infoY + 12 + lineHeight * 0}
          dy="0.35em"
          textAnchor="middle"
          fontSize={infoFontSize}
          fontWeight={700}
          fontFamily="monospace"
          fill={textColor}
          style={{ userSelect: 'none' }}
        >
          {line1}
        </text>

        {/* Time diff line */}
        <text
          x={infoX + infoWidth / 2}
          y={infoY + 12 + lineHeight * 1}
          dy="0.35em"
          textAnchor="middle"
          fontSize={infoFontSize - 1}
          fontWeight={400}
          fontFamily="monospace"
          fill={darkMode ? '#a0a0a0' : '#b0b0b0'}
          style={{ userSelect: 'none' }}
        >
          {line2}
        </text>
      </g>

      {/* Price labels at the two levels (right side) */}
      <g style={{ pointerEvents: 'none' }}>
        <rect
          x={rectRight + 4}
          y={y1 - 9}
          width={70}
          height={18}
          fill={bgColor}
          rx={3}
          stroke={borderColor}
          strokeWidth={0.5}
          strokeOpacity={0.4}
        />
        <text
          x={rectRight + 39}
          y={y1}
          dy="0.35em"
          textAnchor="middle"
          fontSize={10}
          fontFamily="monospace"
          fill={darkMode ? '#d0d0d0' : '#e0e0e0'}
          style={{ userSelect: 'none' }}
        >
          {formatPrice(annotation.price1)}
        </text>
      </g>
      <g style={{ pointerEvents: 'none' }}>
        <rect
          x={rectRight + 4}
          y={y2 - 9}
          width={70}
          height={18}
          fill={bgColor}
          rx={3}
          stroke={borderColor}
          strokeWidth={0.5}
          strokeOpacity={0.4}
        />
        <text
          x={rectRight + 39}
          y={y2}
          dy="0.35em"
          textAnchor="middle"
          fontSize={10}
          fontFamily="monospace"
          fill={darkMode ? '#d0d0d0' : '#e0e0e0'}
          style={{ userSelect: 'none' }}
        >
          {formatPrice(annotation.price2)}
        </text>
      </g>
    </g>
  );
};

export default MeasureAnnotationView;
