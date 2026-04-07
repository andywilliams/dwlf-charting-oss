import React, { useCallback, useEffect, useRef } from 'react';
import type { TimeRangeAnnotation, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex } from './annotationUtils';
import { RECT_HIT_PADDING } from './annotationConstants';

export interface TimeRangeAnnotationViewProps {
  annotation: TimeRangeAnnotation;
  xScale: XScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<TimeRangeAnnotation>) => void;
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

const TimeRangeAnnotationView: React.FC<TimeRangeAnnotationViewProps> = ({
  annotation,
  xScale,
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
  const dragStartX = useRef<number>(0);
  const dragStartCoords = useRef<{ time1: number; time2: number }>({ time1: 0, time2: 0 });

  const xScaleRef = useRef(xScale);
  const timeToIndexRef = useRef(timeToIndex);
  const indexToTimeRef = useRef(indexToTime);
  const compressedTimesRef = useRef(compressedTimes);

  useEffect(() => {
    xScaleRef.current = xScale;
    timeToIndexRef.current = timeToIndex;
    indexToTimeRef.current = indexToTime;
    compressedTimesRef.current = compressedTimes;
  }, [xScale, timeToIndex, indexToTime, compressedTimes]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const resolveXValue = useCallback((time: number): number | undefined => {
    const t2i = timeToIndexRef.current;
    if (!t2i) return undefined;
    const ct = compressedTimesRef.current;
    return findClosestIndex(time, ct, t2i) ?? t2i(time);
  }, []);

  /** Convert a delta in screen px back to a time shift */
  const screenToTimeDelta = useCallback((startTime: number, deltaX: number): number => {
    const xS = xScaleRef.current;
    const t2i = timeToIndexRef.current;
    const i2t = indexToTimeRef.current;
    const isCompressed = Boolean(t2i && i2t);

    if (isCompressed) {
      const indexValue = resolveXValue(startTime);
      if (indexValue === undefined) return startTime;
      const newX = xS(indexValue) + deltaX;
      if (!xS.invert) return startTime;
      const inverted = xS.invert(newX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      return i2t(Math.round(rawValue));
    }

    const startXValue = startTime;
    const newX = xS(startXValue) + deltaX;
    if (!xS.invert) return startTime;
    const inverted = xS.invert(newX);
    const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
    return rawValue;
  }, [resolveXValue]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    dragStartCoords.current = { time1: annotation.time1, time2: annotation.time2 };
  }, [annotation.time1, annotation.time2]);

  const handleBodyDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartX.current;
    const start = dragStartCoords.current;

    const newTime1 = screenToTimeDelta(start.time1, deltaX);
    const newTime2 = screenToTimeDelta(start.time2, deltaX);

    if (Number.isFinite(newTime1) && Number.isFinite(newTime2)) {
      onMove?.(annotation.id, { time1: newTime1, time2: newTime2 });
    }
  }, [annotation.id, onMove, screenToTimeDelta]);

  const makeEdgeDragMove = useCallback((edge: 'left' | 'right') => {
    return (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartX.current;
      const start = dragStartCoords.current;
      const xS = xScaleRef.current;
      const t2i = timeToIndexRef.current;
      const i2t = indexToTimeRef.current;
      const isCompressed = Boolean(t2i && i2t);

      // Figure out which time is visually left/right
      const x1Value = isCompressed ? resolveXValue(start.time1) : start.time1;
      const x2Value = isCompressed ? resolveXValue(start.time2) : start.time2;
      const isTime1Left = x1Value !== undefined && x2Value !== undefined
        ? xS(x1Value) <= xS(x2Value)
        : start.time1 <= start.time2;

      if (edge === 'left') {
        const baseTime = isTime1Left ? start.time1 : start.time2;
        const newTime = screenToTimeDelta(baseTime, deltaX);
        if (Number.isFinite(newTime)) {
          onMove?.(annotation.id, isTime1Left ? { time1: newTime } : { time2: newTime });
        }
      } else {
        const baseTime = isTime1Left ? start.time2 : start.time1;
        const newTime = screenToTimeDelta(baseTime, deltaX);
        if (Number.isFinite(newTime)) {
          onMove?.(annotation.id, isTime1Left ? { time2: newTime } : { time1: newTime });
        }
      }
    };
  }, [annotation.id, onMove, screenToTimeDelta, resolveXValue]);

  // Keep a ref to current drag handler
  const edgeHandlerRef = useRef<(e: MouseEvent) => void>(handleBodyDragMove);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    edgeHandlerRef.current(moveEvent);
  }, []);

  const { isDragging, handleMouseDown: rawMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  const startBodyDrag = useCallback((e: React.MouseEvent) => {
    edgeHandlerRef.current = handleBodyDragMove;
    rawMouseDown(e);
  }, [handleBodyDragMove, rawMouseDown]);

  const startEdgeDrag = useCallback((edge: 'left' | 'right') => {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      edgeHandlerRef.current = makeEdgeDragMove(edge);
      rawMouseDown(e);
    };
  }, [makeEdgeDragMove, rawMouseDown]);

  // Compute x positions
  const getIndexValue = (time: number): number | undefined => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) return timeToIndex(time);
    return undefined;
  };

  const indexValue1 = getIndexValue(annotation.time1);
  const indexValue2 = getIndexValue(annotation.time2);

  if (timeToIndex && (indexValue1 === undefined || indexValue2 === undefined)) {
    return null;
  }

  const xValue1 = indexValue1 ?? annotation.time1;
  const xValue2 = indexValue2 ?? annotation.time2;

  const x1 = xScale(xValue1);
  const x2 = xScale(xValue2);

  if (!Number.isFinite(x1) || !Number.isFinite(x2)) return null;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const bandWidth = right - left;

  // Don't render if completely outside visible area
  if (right < -50 || left > chartWidth + 50) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionColor = darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  const edgeHandleWidth = 6;
  const edgeHandleHeight = 40;

  return (
    <g
      className="timerange-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <rect
          x={left - 3}
          y={-3}
          width={bandWidth + 6}
          height={paneHeight + 6}
          fill="none"
          stroke={selectionColor}
          strokeWidth={3}
        />
      )}

      {/* Hit area (invisible, slightly larger for easier clicking) */}
      <rect
        x={left - RECT_HIT_PADDING}
        y={0}
        width={bandWidth + RECT_HIT_PADDING * 2}
        height={paneHeight}
        fill="transparent"
        stroke="transparent"
        strokeWidth={RECT_HIT_PADDING}
        style={{ cursor: 'pointer' }}
      />

      {/* Semi-transparent fill band (full height) */}
      <rect
        x={left}
        y={0}
        width={bandWidth}
        height={paneHeight}
        fill={annotation.color}
        fillOpacity={annotation.fillOpacity}
        onMouseDown={selected ? startBodyDrag : undefined}
        style={{ cursor: selected ? (isDragging ? 'grabbing' : 'move') : 'pointer' }}
      />

      {/* Left edge line */}
      <line
        x1={left}
        x2={left}
        y1={0}
        y2={paneHeight}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
      />

      {/* Right edge line */}
      <line
        x1={right}
        x2={right}
        y1={0}
        y2={paneHeight}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
      />

      {/* Label at top-left of band */}
      {annotation.label && (
        <g>
          <rect
            x={left + 4}
            y={4}
            width={Math.max(40, annotation.label.length * 7 + 12)}
            height={18}
            fill={annotation.color}
            fillOpacity={0.85}
            rx={3}
          />
          <text
            x={left + 10}
            y={16}
            fontSize={11}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {annotation.label}
          </text>
        </g>
      )}

      {/* Edge drag handles when selected */}
      {selected && (
        <>
          {/* Left edge handle */}
          <rect
            x={left - edgeHandleWidth / 2}
            y={paneHeight / 2 - edgeHandleHeight / 2}
            width={edgeHandleWidth}
            height={edgeHandleHeight}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={annotation.color}
            strokeWidth={1.5}
            onMouseDown={startEdgeDrag('left')}
            style={{ cursor: 'ew-resize' }}
          />
          {/* Left handle grip lines */}
          <line
            x1={left - 1} x2={left - 1}
            y1={paneHeight / 2 - 6} y2={paneHeight / 2 + 6}
            stroke={annotation.color} strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
          <line
            x1={left + 1} x2={left + 1}
            y1={paneHeight / 2 - 6} y2={paneHeight / 2 + 6}
            stroke={annotation.color} strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />

          {/* Right edge handle */}
          <rect
            x={right - edgeHandleWidth / 2}
            y={paneHeight / 2 - edgeHandleHeight / 2}
            width={edgeHandleWidth}
            height={edgeHandleHeight}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={annotation.color}
            strokeWidth={1.5}
            onMouseDown={startEdgeDrag('right')}
            style={{ cursor: 'ew-resize' }}
          />
          {/* Right handle grip lines */}
          <line
            x1={right - 1} x2={right - 1}
            y1={paneHeight / 2 - 6} y2={paneHeight / 2 + 6}
            stroke={annotation.color} strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
          <line
            x1={right + 1} x2={right + 1}
            y1={paneHeight / 2 - 6} y2={paneHeight / 2 + 6}
            stroke={annotation.color} strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}
    </g>
  );
};

export default TimeRangeAnnotationView;
