import React, { useCallback, useEffect, useRef } from 'react';
import type { ArrowAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex } from './annotationUtils';
import { HANDLE_RADIUS, HIT_AREA_WIDTH } from './annotationConstants';

export interface ArrowAnnotationViewProps {
  annotation: ArrowAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<ArrowAnnotation>) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
  onDoubleClick?: (id: string) => void;
}

const LINE_STYLE_MAP: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 4',
};

/** Calculate arrowhead points for the target end of the line */
const getArrowheadPoints = (
  x1: number, y1: number,
  x2: number, y2: number,
  headLength: number = 12,
  headAngle: number = Math.PI / 6,
): string => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const p1x = x2 - headLength * Math.cos(angle - headAngle);
  const p1y = y2 - headLength * Math.sin(angle - headAngle);
  const p2x = x2 - headLength * Math.cos(angle + headAngle);
  const p2y = y2 - headLength * Math.sin(angle + headAngle);
  return `${p1x},${p1y} ${x2},${y2} ${p2x},${p2y}`;
};

const ArrowAnnotationView: React.FC<ArrowAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onMove,
  onDoubleClick,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes,
}) => {
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartCoords = useRef<{
    time1: number; price1: number; time2: number; price2: number;
  }>({ time1: 0, price1: 0, time2: 0, price2: 0 });
  const dragTarget = useRef<'body' | 'point1' | 'point2'>('body');

  const xScaleRef = useRef(xScale);
  const yScaleRef = useRef(yScale);
  const timeToIndexRef = useRef(timeToIndex);
  const indexToTimeRef = useRef(indexToTime);
  const compressedTimesRef = useRef(compressedTimes);

  useEffect(() => {
    xScaleRef.current = xScale;
    yScaleRef.current = yScale;
    timeToIndexRef.current = timeToIndex;
    indexToTimeRef.current = indexToTime;
    compressedTimesRef.current = compressedTimes;
  }, [xScale, yScale, timeToIndex, indexToTime, compressedTimes]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(annotation.id);
  }, [annotation.id, onDoubleClick]);

  /** Convert screen delta to new time/price from a starting coordinate */
  const screenToCoords = useCallback((
    startTime: number,
    startPrice: number,
    deltaX: number,
    deltaY: number,
  ): { time: number; price: number } => {
    const xS = xScaleRef.current;
    const yS = yScaleRef.current;
    const t2i = timeToIndexRef.current;
    const i2t = indexToTimeRef.current;
    const ct = compressedTimesRef.current;

    const startXValue = (t2i && i2t)
      ? (findClosestIndex(startTime, ct, t2i) ?? startTime)
      : startTime;
    const newScreenX = xS(startXValue) + deltaX;
    const newScreenY = yS.scale(startPrice) + deltaY;

    let newTime = startTime;
    if (xS.invert) {
      const inverted = xS.invert(newScreenX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      newTime = i2t ? i2t(Math.round(rawValue)) : rawValue;
    }
    const newPrice = yS.invert(newScreenY);

    return { time: newTime, price: newPrice };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartCoords.current = {
      time1: annotation.time1,
      price1: annotation.price1,
      time2: annotation.time2,
      price2: annotation.price2,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const start = dragStartCoords.current;
    const target = dragTarget.current;

    if (target === 'point1') {
      const { time, price } = screenToCoords(start.time1, start.price1, deltaX, deltaY);
      if (Number.isFinite(time) && Number.isFinite(price)) {
        onMove?.(annotation.id, { time1: time, price1: price });
      }
    } else if (target === 'point2') {
      const { time, price } = screenToCoords(start.time2, start.price2, deltaX, deltaY);
      if (Number.isFinite(time) && Number.isFinite(price)) {
        onMove?.(annotation.id, { time2: time, price2: price });
      }
    } else {
      // Move entire annotation
      const c1 = screenToCoords(start.time1, start.price1, deltaX, deltaY);
      const c2 = screenToCoords(start.time2, start.price2, deltaX, deltaY);
      if (Number.isFinite(c1.time) && Number.isFinite(c1.price) &&
          Number.isFinite(c2.time) && Number.isFinite(c2.price)) {
        onMove?.(annotation.id, {
          time1: c1.time, price1: c1.price,
          time2: c2.time, price2: c2.price,
        });
      }
    }
  }, [annotation.id, onMove, screenToCoords]);

  const { isDragging, handleMouseDown: rawMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  const startDrag = useCallback((target: 'body' | 'point1' | 'point2') => {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      dragTarget.current = target;
      rawMouseDown(e);
    };
  }, [rawMouseDown]);

  // Convert timestamps to x positions
  const getXValue = (time: number): number | undefined => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) return timeToIndex(time);
    return undefined;
  };

  const xVal1 = getXValue(annotation.time1);
  const xVal2 = getXValue(annotation.time2);
  if (timeToIndex && (xVal1 === undefined || xVal2 === undefined)) return null;
  const sx1 = xScale(xVal1 ?? annotation.time1);
  const sy1 = yScale.scale(annotation.price1);
  const sx2 = xScale(xVal2 ?? annotation.time2);
  const sy2 = yScale.scale(annotation.price2);

  if (!Number.isFinite(sx1) || !Number.isFinite(sy1) ||
      !Number.isFinite(sx2) || !Number.isFinite(sy2)) return null;

  // Skip if both points are way outside visible area
  const margin = 100;
  const allOutside = (sx1 < -margin && sx2 < -margin) ||
                     (sx1 > chartWidth + margin && sx2 > chartWidth + margin) ||
                     (sy1 < -margin && sy2 < -margin) ||
                     (sy1 > paneHeight + margin && sy2 > paneHeight + margin);
  if (allOutside) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionColor = darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Text box dimensions at point 1
  const padding = 6;
  const lineHeight = annotation.fontSize * 1.3;
  const textContent = annotation.text || '';
  // Split text by newlines for multiline support
  const textLines = textContent.split('\n');
  const numLines = textLines.length;
  // Calculate width based on longest line
  const maxLineLength = Math.max(...textLines.map(line => line.length), 1);
  const textWidth = Math.max(24, maxLineLength * (annotation.fontSize * 0.6) + padding * 2);
  // Height based on number of lines (match TextAnnotationView: single line uses fontSize, multi uses lineHeight)
  const textHeight = numLines === 1
    ? annotation.fontSize + padding * 2
    : numLines * lineHeight + padding * 2;
  const bgColor = darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const borderColor = selected
    ? (darkMode ? '#63b3ed' : '#3b82f6')
    : annotation.color;

  // Shorten line so it starts from edge of text box, not center
  const dx = sx2 - sx1;
  const dy = sy2 - sy1;
  const lineLen = Math.sqrt(dx * dx + dy * dy);
  let lineStartX = sx1;
  let lineStartY = sy1;
  if (lineLen > 0 && textContent) {
    // Offset the start of the line to the edge of the text box
    const halfW = textWidth / 2;
    const halfH = textHeight / 2;
    // Simple ratio-based offset
    const ratioX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY;
    const ratioY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY;
    const ratio = Math.min(ratioX, ratioY);
    const offset = Math.min(lineLen * ratio, lineLen * 0.4);
    lineStartX = sx1 + (dx / lineLen) * offset;
    lineStartY = sy1 + (dy / lineLen) * offset;
  }

  const arrowheadPoints = getArrowheadPoints(lineStartX, lineStartY, sx2, sy2, 10 + annotation.lineWidth * 2);

  return (
    <g
      className="arrow-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow on line */}
      {selected && (
        <line
          x1={lineStartX}
          y1={lineStartY}
          x2={sx2}
          y2={sy2}
          stroke={selectionColor}
          strokeWidth={annotation.lineWidth + 6}
          strokeLinecap="round"
        />
      )}

      {/* Hit area (invisible, wider for easier clicking) */}
      <line
        x1={sx1}
        y1={sy1}
        x2={sx2}
        y2={sy2}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
      />

      {/* Main line */}
      <line
        x1={lineStartX}
        y1={lineStartY}
        x2={sx2}
        y2={sy2}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        onMouseDown={selected ? startDrag('body') : undefined}
        style={{ cursor: selected ? (isDragging ? 'grabbing' : 'move') : 'pointer' }}
      />

      {/* Arrowhead at target (point 2) */}
      <polyline
        points={arrowheadPoints}
        fill="none"
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth + 0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />

      {/* Text box at point 1 (callout origin) */}
      {textContent && (
        <g>
          {/* Selection glow on text box */}
          {selected && (
            <rect
              x={sx1 - textWidth / 2 - 3}
              y={sy1 - textHeight / 2 - 3}
              width={textWidth + 6}
              height={textHeight + 6}
              fill="none"
              stroke={selectionColor}
              strokeWidth={3}
              rx={6}
            />
          )}
          {/* Text box background */}
          <rect
            x={sx1 - textWidth / 2}
            y={sy1 - textHeight / 2}
            width={textWidth}
            height={textHeight}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={1}
            rx={4}
            onMouseDown={selected ? startDrag('point1') : undefined}
            style={{ cursor: selected ? (isDragging ? 'grabbing' : 'move') : 'pointer' }}
          />
          {/* Text (supports multiline via tspan elements) */}
          <text
            x={sx1}
            textAnchor="middle"
            fontSize={annotation.fontSize}
            fill={annotation.color}
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {textLines.map((line, i) => (
              <tspan
                key={i}
                x={sx1}
                y={sy1 - (textHeight / 2) + padding + lineHeight * (i + 0.7)}
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}

      {/* Drag handles when selected */}
      {selected && (
        <>
          {/* Point 1 handle (text box / callout origin) */}
          <circle
            cx={sx1}
            cy={sy1 - textHeight / 2 - 8}
            r={HANDLE_RADIUS}
            fill={handleColor}
            stroke={annotation.color}
            strokeWidth={1.5}
            onMouseDown={startDrag('point1')}
            style={{ cursor: 'move' }}
          />

          {/* Point 2 handle (arrow target) */}
          <circle
            cx={sx2}
            cy={sy2}
            r={HANDLE_RADIUS}
            fill={handleColor}
            stroke={annotation.color}
            strokeWidth={1.5}
            onMouseDown={startDrag('point2')}
            style={{ cursor: 'move' }}
          />
        </>
      )}
    </g>
  );
};

export default ArrowAnnotationView;
