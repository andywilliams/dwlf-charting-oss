import React, { useCallback, useEffect, useRef } from 'react';
import type { VLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex, LINE_STYLE_MAP } from './annotationUtils';
import { HIT_AREA_WIDTH, DRAG_HANDLE_SIZE, HANDLE_EDGE_OFFSET } from './annotationConstants';

export interface VLineAnnotationViewProps {
  annotation: VLineAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onDoubleClick?: (id: string) => void;
  onMove?: (id: string, newTime: number) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
  /** Optional time formatter for the label */
  timeFormatter?: (t: number) => string;
}

const defaultTimeFormatter = (t: number): string => {
  const d = new Date(t);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
};

const VLineAnnotationView: React.FC<VLineAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onDoubleClick,
  onMove,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes,
  timeFormatter = defaultTimeFormatter,
}) => {
  const dragStartX = useRef<number>(0);
  const dragStartTime = useRef<number>(0);
  const xScaleRef = useRef(xScale);
  const timeToIndexRef = useRef(timeToIndex);
  const indexToTimeRef = useRef(indexToTime);
  const compressedTimesRef = useRef(compressedTimes);
  const dataLengthRef = useRef(dataLength);

  useEffect(() => {
    xScaleRef.current = xScale;
    timeToIndexRef.current = timeToIndex;
    indexToTimeRef.current = indexToTime;
    compressedTimesRef.current = compressedTimes;
    dataLengthRef.current = dataLength;
  }, [xScale, timeToIndex, indexToTime, compressedTimes, dataLength]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(annotation.id);
  }, [annotation.id, onDoubleClick]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    dragStartTime.current = annotation.time;
  }, [annotation.time]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartX.current;
    const xScaleCurrent = xScaleRef.current;
    const timeToIndexCurrent = timeToIndexRef.current;
    const indexToTimeCurrent = indexToTimeRef.current;
    const compressedTimesCurrent = compressedTimesRef.current;
    const dataLengthCurrent = dataLengthRef.current;

    // Convert timestamp to xValue (index if compressGaps, timestamp otherwise)
    const startXValue = timeToIndexCurrent && indexToTimeCurrent && dataLengthCurrent > 0
      ? (findClosestIndex(dragStartTime.current, compressedTimesCurrent, timeToIndexCurrent) ?? dragStartTime.current)
      : dragStartTime.current;
    const newX = xScaleCurrent(startXValue) + deltaX;

    // Convert back to timestamp
    let newTime = dragStartTime.current;
    if (xScaleCurrent.invert) {
      const inverted = xScaleCurrent.invert(newX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      newTime = indexToTimeCurrent ? indexToTimeCurrent(Math.round(rawValue)) : rawValue;
    }

    if (Number.isFinite(newTime)) {
      onMove?.(annotation.id, newTime);
    }
  }, [annotation.id, onMove]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  // Resolve x position (support compressGaps)
  let indexValue: number | undefined;
  if (timeToIndex && indexToTime && dataLength > 0) {
    indexValue = findClosestIndex(annotation.time, compressedTimes, timeToIndex);
  } else if (timeToIndex) {
    indexValue = timeToIndex(annotation.time);
  }

  if (timeToIndex && indexValue === undefined) {
    return null;
  }

  const xValue = indexValue ?? annotation.time;
  const x = xScale(xValue);

  if (!Number.isFinite(x) || x < -20 || x > chartWidth + 20) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const labelText = annotation.label || (annotation.showTime ? timeFormatter(annotation.time) : '');
  const labelWidth = Math.max(60, labelText.length * 7 + 16);

  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  return (
    <g
      className="vline-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <line
          x1={x}
          x2={x}
          y1={0}
          y2={paneHeight}
          stroke={selectionGlow}
          strokeWidth={annotation.lineWidth + 6}
          strokeLinecap="round"
        />
      )}

      {/* Hit area (invisible, wider for easier clicking) */}
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={paneHeight}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
      />

      {/* Main line */}
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={paneHeight}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Label badge at top */}
      {labelText && (
        <g>
          <rect
            x={x - labelWidth / 2}
            y={4}
            width={labelWidth}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={x}
            y={14}
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

      {/* Drag handle (bottom) */}
      {selected && (
        <g
          onMouseDown={handleMouseDown}
          style={{ cursor: 'ew-resize' }}
        >
          <rect
            x={x - DRAG_HANDLE_SIZE / 2}
            y={paneHeight - DRAG_HANDLE_SIZE - HANDLE_EDGE_OFFSET}
            width={DRAG_HANDLE_SIZE}
            height={DRAG_HANDLE_SIZE}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={annotation.color}
            strokeWidth={2}
          />
          {/* Drag indicator lines (vertical) - derived from constants for consistent centering */}
          <line x1={x - 2} x2={x - 2} y1={paneHeight - DRAG_HANDLE_SIZE * 0.75 - HANDLE_EDGE_OFFSET} y2={paneHeight - DRAG_HANDLE_SIZE * 0.25 - HANDLE_EDGE_OFFSET} stroke={annotation.color} strokeWidth={1.5} />
          <line x1={x + 2} x2={x + 2} y1={paneHeight - DRAG_HANDLE_SIZE * 0.75 - HANDLE_EDGE_OFFSET} y2={paneHeight - DRAG_HANDLE_SIZE * 0.25 - HANDLE_EDGE_OFFSET} stroke={annotation.color} strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
};

export default VLineAnnotationView;
