import React, { useCallback, useEffect, useRef } from 'react';
import type { CrossLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestIndex, LINE_STYLE_MAP, resolveX } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { HANDLE_RADIUS, HIT_AREA_WIDTH } from './annotationConstants';

export interface CrossLineAnnotationViewProps {
  annotation: CrossLineAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, newTime: number, newPrice: number) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
  /** Custom time formatter (defaults to MM/DD HH:MM) */
  timeFormatter?: (t: number) => string;
}

const defaultTimeFormatter = (timestamp: number): string => {
  const d = new Date(timestamp);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

/**
 * Cross Line annotation — draws a horizontal + vertical line intersection
 * at a single (time, price) point, showing both price and date.
 */
const CrossLineAnnotationView: React.FC<CrossLineAnnotationViewProps> = ({
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
  timeFormatter = defaultTimeFormatter,
}) => {
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartData = useRef<{ time: number; price: number }>({ time: 0, price: 0 });
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

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = { time: annotation.time, price: annotation.price };
  }, [annotation.time, annotation.price]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;

    const xScaleCurrent = xScaleRef.current;
    const yScaleCurrent = yScaleRef.current;
    const timeToIndexCurrent = timeToIndexRef.current;
    const indexToTimeCurrent = indexToTimeRef.current;
    const compressedTimesCurrent = compressedTimesRef.current;
    const dataLengthCurrent = dataLengthRef.current;

    // Resolve starting x value for the time
    let startXValue: number;
    if (timeToIndexCurrent && indexToTimeCurrent && dataLengthCurrent > 0) {
      startXValue = findClosestIndex(dragStartData.current.time, compressedTimesCurrent, timeToIndexCurrent) ?? dragStartData.current.time;
    } else {
      startXValue = dragStartData.current.time;
    }

    const newX = xScaleCurrent(startXValue) + deltaX;
    const newY = yScaleCurrent.scale(dragStartData.current.price) + deltaY;

    let newTime = dragStartData.current.time;
    if (xScaleCurrent.invert) {
      const inverted = xScaleCurrent.invert(newX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      newTime = indexToTimeCurrent ? indexToTimeCurrent(Math.round(rawValue)) : rawValue;
    }
    const newPrice = yScaleCurrent.invert(newY);

    if (Number.isFinite(newTime) && Number.isFinite(newPrice)) {
      onMove?.(annotation.id, newTime, newPrice);
    }
  }, [annotation.id, onMove]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  // Resolve pixel positions
  const x = resolveX(annotation.time, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const y = yScale.scale(annotation.price);

  if (x === undefined || !Number.isFinite(y)) return null;

  // Don't render if the intersection point is far outside visible area
  if (x < -50 || x > chartWidth + 50 || y < -50 || y > paneHeight + 50) {
    // Still render the lines if one axis is in range
    const xInRange = x >= -50 && x <= chartWidth + 50;
    const yInRange = y >= -50 && y <= paneHeight + 50;
    if (!xInRange && !yInRange) return null;
  }

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Labels
  const priceText = annotation.showPrice ? annotation.price.toFixed(2) : '';
  const timeText = annotation.showTime ? timeFormatter(annotation.time) : '';
  const labelText = annotation.label || '';

  const priceLabelWidth = priceText ? Math.max(50, priceText.length * 7 + 16) : 0;
  const timeLabelWidth = timeText ? Math.max(60, timeText.length * 7 + 16) : 0;

  return (
    <g
      className="crossline-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow — horizontal */}
      {selected && (
        <>
          <line
            x1={0} x2={chartWidth} y1={y} y2={y}
            stroke={selectionGlow}
            strokeWidth={annotation.lineWidth + 6}
            strokeLinecap="round"
          />
          <line
            x1={x} x2={x} y1={0} y2={paneHeight}
            stroke={selectionGlow}
            strokeWidth={annotation.lineWidth + 6}
            strokeLinecap="round"
          />
        </>
      )}

      {/* Hit area — horizontal (invisible, wider for easier clicking) */}
      <line
        x1={0} x2={chartWidth} y1={y} y2={y}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
      />

      {/* Hit area — vertical */}
      <line
        x1={x} x2={x} y1={0} y2={paneHeight}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
      />

      {/* Main horizontal line */}
      <line
        x1={0} x2={chartWidth} y1={y} y2={y}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Main vertical line */}
      <line
        x1={x} x2={x} y1={0} y2={paneHeight}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Intersection dot */}
      <circle
        cx={x} cy={y}
        r={4}
        fill={annotation.color}
        fillOpacity={0.9}
        stroke={darkMode ? '#1a1a2e' : '#fff'}
        strokeWidth={1.5}
      />

      {/* Price label badge on right */}
      {priceText && (
        <g>
          <rect
            x={chartWidth - priceLabelWidth - 8}
            y={y - 10}
            width={priceLabelWidth}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={chartWidth - priceLabelWidth / 2 - 8}
            y={y}
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {priceText}
          </text>
        </g>
      )}

      {/* Time label badge on bottom */}
      {timeText && (
        <g>
          <rect
            x={x - timeLabelWidth / 2}
            y={paneHeight - 20}
            width={timeLabelWidth}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={x}
            y={paneHeight - 10}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {timeText}
          </text>
        </g>
      )}

      {/* Custom label at the intersection (offset top-right) */}
      {labelText && (
        <g>
          <rect
            x={x + 8}
            y={y - 22}
            width={Math.max(30, labelText.length * 7 + 12)}
            height={18}
            fill={annotation.color}
            fillOpacity={0.85}
            rx={3}
          />
          <text
            x={x + 8 + Math.max(30, labelText.length * 7 + 12) / 2}
            y={y - 13}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {labelText}
          </text>
        </g>
      )}

      {/* Drag handle at intersection (when selected) */}
      {selected && (
        <g
          onMouseDown={handleMouseDown}
          style={{ cursor: 'move' }}
        >
          <circle
            cx={x} cy={y}
            r={HANDLE_RADIUS}
            fill={handleColor}
            fillOpacity={0.9}
            stroke={annotation.color}
            strokeWidth={2}
          />
          {/* Cross indicator inside handle */}
          <line x1={x - 3} x2={x + 3} y1={y} y2={y} stroke={annotation.color} strokeWidth={1.5} />
          <line x1={x} x2={x} y1={y - 3} y2={y + 3} stroke={annotation.color} strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
};

export default CrossLineAnnotationView;
