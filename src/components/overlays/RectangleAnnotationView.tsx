import React, { useCallback, useEffect, useRef } from 'react';
import type { RectangleAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestTime } from '../../charting/scales';
import useAnnotationDrag from './useAnnotationDrag';
import { CORNER_SIZE, RECT_HIT_PADDING } from './annotationConstants';

export interface RectangleAnnotationViewProps {
  annotation: RectangleAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<RectangleAnnotation>) => void;
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

const findClosestIndex = (
  time: number,
  times: number[] | undefined,
  timeToIndex: ((t: number) => number | undefined) | undefined,
): number | undefined => {
  if (!timeToIndex) return undefined;
  const exact = timeToIndex(time);
  if (exact !== undefined) return exact;
  if (!times || !times.length) return undefined;
  const closestTime = findClosestTime(times, time);
  if (!Number.isFinite(closestTime)) return undefined;
  return timeToIndex(closestTime);
};

const RectangleAnnotationView: React.FC<RectangleAnnotationViewProps> = ({
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
    time1: number; price1: number;
    time2: number; price2: number;
  }>({ time1: 0, price1: 0, time2: 0, price2: 0 });
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

  /** Convert a delta in screen px back to a time shift */
  const screenToTimeDelta = useCallback((startTime: number, deltaX: number): number => {
    const xS = xScaleRef.current;
    const t2i = timeToIndexRef.current;
    const i2t = indexToTimeRef.current;
    const ct = compressedTimesRef.current;

    const dlCurrent = dataLengthRef.current;
    const startXValue = (t2i && i2t && dlCurrent > 0)
      ? (findClosestIndex(startTime, ct, t2i) ?? startTime)
      : startTime;
    const newX = xS(startXValue) + deltaX;
    if (!xS.invert) return startTime;
    const inverted = xS.invert(newX);
    const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
    return (t2i && i2t && dlCurrent > 0) ? i2t(Math.round(rawValue)) : rawValue;
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartCoords.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2]);

  const handleBodyDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const yS = yScaleRef.current;
    const start = dragStartCoords.current;

    const newTime1 = screenToTimeDelta(start.time1, deltaX);
    const newTime2 = screenToTimeDelta(start.time2, deltaX);
    const newPrice1 = yS.invert(yS.scale(start.price1) + deltaY);
    const newPrice2 = yS.invert(yS.scale(start.price2) + deltaY);

    if ([newTime1, newTime2, newPrice1, newPrice2].every(Number.isFinite)) {
      onMove?.(annotation.id, {
        time1: newTime1, price1: newPrice1,
        time2: newTime2, price2: newPrice2,
      });
    }
  }, [annotation.id, onMove, screenToTimeDelta]);

  const makeCornerDragMove = useCallback((corner: 'tl' | 'tr' | 'bl' | 'br') => {
    return (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartPos.current.x;
      const deltaY = moveEvent.clientY - dragStartPos.current.y;
      const yS = yScaleRef.current;
      const start = dragStartCoords.current;

      // Determine which time/price to move based on visual corner
      // tl/bl affect the left time, tr/br affect the right time
      // tl/tr affect the top price, bl/br affect the bottom price
      const y1Screen = yS.scale(start.price1);
      const y2Screen = yS.scale(start.price2);
      const isPrice1Top = y1Screen <= y2Screen;

      const update: Partial<RectangleAnnotation> = {};

      // Time: figure out which time is left/right
      const xS = xScaleRef.current;
      const t2i = timeToIndexRef.current;
      const ct = compressedTimesRef.current;
      const x1Value = (t2i ? findClosestIndex(start.time1, ct, t2i) : undefined) ?? start.time1;
      const x2Value = (t2i ? findClosestIndex(start.time2, ct, t2i) : undefined) ?? start.time2;
      const x1Screen = xS(x1Value);
      const x2Screen = xS(x2Value);
      const isTime1Left = x1Screen <= x2Screen;

      if (corner === 'tl' || corner === 'bl') {
        // Move left time
        const baseTime = isTime1Left ? start.time1 : start.time2;
        const newTime = screenToTimeDelta(baseTime, deltaX);
        if (Number.isFinite(newTime)) {
          if (isTime1Left) update.time1 = newTime; else update.time2 = newTime;
        }
      } else {
        // Move right time
        const baseTime = isTime1Left ? start.time2 : start.time1;
        const newTime = screenToTimeDelta(baseTime, deltaX);
        if (Number.isFinite(newTime)) {
          if (isTime1Left) update.time2 = newTime; else update.time1 = newTime;
        }
      }

      if (corner === 'tl' || corner === 'tr') {
        // Move top price
        const basePrice = isPrice1Top ? start.price1 : start.price2;
        const newPrice = yS.invert(yS.scale(basePrice) + deltaY);
        if (Number.isFinite(newPrice)) {
          if (isPrice1Top) update.price1 = newPrice; else update.price2 = newPrice;
        }
      } else {
        // Move bottom price
        const basePrice = isPrice1Top ? start.price2 : start.price1;
        const newPrice = yS.invert(yS.scale(basePrice) + deltaY);
        if (Number.isFinite(newPrice)) {
          if (isPrice1Top) update.price2 = newPrice; else update.price1 = newPrice;
        }
      }

      onMove?.(annotation.id, update);
    };
  }, [annotation.id, onMove, screenToTimeDelta]);

  // Keep a ref to current corner handler
  const cornerHandlerRef = useRef<(e: MouseEvent) => void>(handleBodyDragMove);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    cornerHandlerRef.current(moveEvent);
  }, []);

  const { isDragging, handleMouseDown: rawMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  // Wrap to set the right handler before starting drag
  const startBodyDrag = useCallback((e: React.MouseEvent) => {
    cornerHandlerRef.current = handleBodyDragMove;
    rawMouseDown(e);
  }, [handleBodyDragMove, rawMouseDown]);

  const startCornerDrag = useCallback((corner: 'tl' | 'tr' | 'bl' | 'br') => {
    return (e: React.MouseEvent) => {
      cornerHandlerRef.current = makeCornerDragMove(corner);
      rawMouseDown(e);
    };
  }, [makeCornerDragMove, rawMouseDown]);

  // Compute positions
  const getXValue = (time: number): number | undefined => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) return timeToIndex(time);
    return undefined;
  };

  const xValue1 = getXValue(annotation.time1);
  const xValue2 = getXValue(annotation.time2);

  // In compressed-gaps mode, skip rendering if time can't be resolved to an index
  if (timeToIndex && (xValue1 === undefined || xValue2 === undefined)) return null;

  const x1 = xScale(xValue1 ?? annotation.time1);
  const x2 = xScale(xValue2 ?? annotation.time2);
  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);

  if ([x1, x2, y1, y2].some(v => !Number.isFinite(v))) return null;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const rectWidth = right - left;
  const rectHeight = bottom - top;

  // Don't render if completely outside visible area
  if (right < -50 || left > chartWidth + 50 || bottom < -50 || top > paneHeight + 50) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionColor = darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  return (
    <g
      className="rectangle-annotation"
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
        fill={annotation.color}
        fillOpacity={annotation.fillOpacity}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        rx={1}
        onMouseDown={selected ? startBodyDrag : undefined}
        style={{ cursor: selected ? (isDragging ? 'grabbing' : 'move') : 'pointer' }}
      />

      {/* Label */}
      {annotation.label && (
        <text
          x={left + 6}
          y={top + 14}
          fontSize={11}
          fill={annotation.color}
          fontWeight={500}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {annotation.label}
        </text>
      )}

      {/* Price range display */}
      {selected && (
        <text
          x={right - 6}
          y={bottom - 6}
          fontSize={10}
          fill={darkMode ? '#94a3b8' : '#64748b'}
          textAnchor="end"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {Math.abs(annotation.price2 - annotation.price1).toFixed(2)}
        </text>
      )}

      {/* Corner drag handles when selected */}
      {selected && (
        <>
          {/* Top-left */}
          <rect
            x={left - CORNER_SIZE / 2}
            y={top - CORNER_SIZE / 2}
            width={CORNER_SIZE}
            height={CORNER_SIZE}
            fill={handleColor}
            stroke={annotation.color}
            strokeWidth={1.5}
            rx={2}
            onMouseDown={startCornerDrag('tl')}
            style={{ cursor: 'nwse-resize' }}
          />
          {/* Top-right */}
          <rect
            x={right - CORNER_SIZE / 2}
            y={top - CORNER_SIZE / 2}
            width={CORNER_SIZE}
            height={CORNER_SIZE}
            fill={handleColor}
            stroke={annotation.color}
            strokeWidth={1.5}
            rx={2}
            onMouseDown={startCornerDrag('tr')}
            style={{ cursor: 'nesw-resize' }}
          />
          {/* Bottom-left */}
          <rect
            x={left - CORNER_SIZE / 2}
            y={bottom - CORNER_SIZE / 2}
            width={CORNER_SIZE}
            height={CORNER_SIZE}
            fill={handleColor}
            stroke={annotation.color}
            strokeWidth={1.5}
            rx={2}
            onMouseDown={startCornerDrag('bl')}
            style={{ cursor: 'nesw-resize' }}
          />
          {/* Bottom-right */}
          <rect
            x={right - CORNER_SIZE / 2}
            y={bottom - CORNER_SIZE / 2}
            width={CORNER_SIZE}
            height={CORNER_SIZE}
            fill={handleColor}
            stroke={annotation.color}
            strokeWidth={1.5}
            rx={2}
            onMouseDown={startCornerDrag('br')}
            style={{ cursor: 'nwse-resize' }}
          />
        </>
      )}
    </g>
  );
};

export default RectangleAnnotationView;
