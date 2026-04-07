import React, { useCallback, useEffect, useRef } from 'react';
import type { FibExtensionAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex } from './annotationUtils';
import { HANDLE_RADIUS, HIT_AREA_WIDTH } from './annotationConstants';

export interface FibExtensionAnnotationViewProps {
  annotation: FibExtensionAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<FibExtensionAnnotation>) => void;
  timeToIndex?: (time: number) => number | undefined;
  indexToTime?: (index: number) => number;
  dataLength?: number;
  compressedTimes?: number[];
}

const LINE_STYLE_MAP: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 4',
};

/** Default fib extension level labels */
const LEVEL_LABELS: Record<number, string> = {
  0: '0%',
  0.236: '23.6%',
  0.382: '38.2%',
  0.5: '50%',
  0.618: '61.8%',
  0.786: '78.6%',
  1: '100%',
  1.272: '127.2%',
  1.618: '161.8%',
  2: '200%',
  2.618: '261.8%',
  3.618: '361.8%',
  4.236: '423.6%',
};

const getLevelLabel = (level: number): string =>
  LEVEL_LABELS[level] ?? `${(level * 100).toFixed(1)}%`;

/** Semi-transparent fill colors alternating for level bands */
const FILL_COLORS = [
  'rgba(139, 92, 246, 0.06)',  // violet
  'rgba(59, 130, 246, 0.06)',  // blue
  'rgba(6, 182, 212, 0.06)',   // cyan
  'rgba(34, 197, 94, 0.06)',   // green
  'rgba(234, 179, 8, 0.06)',   // yellow
  'rgba(249, 115, 22, 0.06)',  // orange
  'rgba(239, 68, 68, 0.06)',   // red
];

/**
 * Resolve a time value to an x-pixel coordinate, handling compressGaps mode.
 */
const resolveX = (
  time: number,
  xScale: XScale,
  timeToIndex: ((t: number) => number | undefined) | undefined,
  indexToTime: ((i: number) => number) | undefined,
  dataLength: number,
  compressedTimes: number[] | undefined,
): number | undefined => {
  let indexValue: number | undefined;
  if (timeToIndex && indexToTime && dataLength > 0) {
    indexValue = findClosestIndex(time, compressedTimes, timeToIndex);
  } else if (timeToIndex) {
    indexValue = timeToIndex(time);
  }

  if (timeToIndex && indexValue === undefined) return undefined;
  const xValue = indexValue ?? time;
  const x = xScale(xValue);
  return Number.isFinite(x) ? x : undefined;
};

const FibExtensionAnnotationView: React.FC<FibExtensionAnnotationViewProps> = ({
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
  const dragStartData = useRef<{
    time1: number; price1: number;
    time2: number; price2: number;
    time3: number; price3: number;
  }>({
    time1: 0, price1: 0, time2: 0, price2: 0, time3: 0, price3: 0,
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

  const saveDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
      time3: annotation.time3, price3: annotation.price3,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2, annotation.time3, annotation.price3]);

  // --- P1 drag ---
  const handleP1DragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const { time, price } = pixelToData(dragStartData.current.time1, dragStartData.current.price1, deltaX, deltaY);
    onMove?.(annotation.id, { time1: time, price1: price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingP1, handleMouseDown: handleP1MouseDown } = useAnnotationDrag({
    onDragStart: saveDragStart,
    onDragMove: handleP1DragMove,
  });

  // --- P2 drag ---
  const handleP2DragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const { time, price } = pixelToData(dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY);
    onMove?.(annotation.id, { time2: time, price2: price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingP2, handleMouseDown: handleP2MouseDown } = useAnnotationDrag({
    onDragStart: saveDragStart,
    onDragMove: handleP2DragMove,
  });

  // --- P3 drag ---
  const handleP3DragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const { time, price } = pixelToData(dragStartData.current.time3, dragStartData.current.price3, deltaX, deltaY);
    onMove?.(annotation.id, { time3: time, price3: price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingP3, handleMouseDown: handleP3MouseDown } = useAnnotationDrag({
    onDragStart: saveDragStart,
    onDragMove: handleP3DragMove,
  });

  // --- Whole annotation drag ---
  const handleWholeDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const p1 = pixelToData(dragStartData.current.time1, dragStartData.current.price1, deltaX, deltaY);
    const p2 = pixelToData(dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY);
    const p3 = pixelToData(dragStartData.current.time3, dragStartData.current.price3, deltaX, deltaY);
    onMove?.(annotation.id, {
      time1: p1.time, price1: p1.price,
      time2: p2.time, price2: p2.price,
      time3: p3.time, price3: p3.price,
    });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingWhole, handleMouseDown: handleWholeMouseDown } = useAnnotationDrag({
    onDragStart: saveDragStart,
    onDragMove: handleWholeDragMove,
  });

  const isDragging = isDraggingP1 || isDraggingP2 || isDraggingP3 || isDraggingWhole;

  // Resolve pixel positions for the three anchor points
  const x1 = resolveX(annotation.time1, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x2 = resolveX(annotation.time2, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x3 = resolveX(annotation.time3, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);

  if (x1 === undefined || x2 === undefined || x3 === undefined) return null;

  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);
  const y3 = yScale.scale(annotation.price3);

  if (!Number.isFinite(y1) || !Number.isFinite(y2) || !Number.isFinite(y3)) return null;

  // Calculate the move distance (P1 → P2)
  const moveDistance = annotation.price2 - annotation.price1;

  // Compute extension levels: projected from P3
  const levels = (annotation.levels && annotation.levels.length > 0)
    ? annotation.levels
    : [0, 0.618, 1, 1.272, 1.618, 2, 2.618];

  const sortedLevels = [...levels].sort((a, b) => a - b);

  const levelData = sortedLevels.map((level) => {
    const price = annotation.price3 + level * moveDistance;
    const y = yScale.scale(price);
    return { level, price, y };
  }).filter(d => Number.isFinite(d.y));

  // Determine the horizontal range for the level lines
  // Start from the earliest x of the three points, extend to chart width
  const levelStartX = Math.min(x1, x2, x3);

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';
  const labelBg = darkMode ? '#1e1e1e' : '#1f2937';

  return (
    <g
      className="fib-extension-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Fill bands between adjacent levels */}
      {annotation.fillOpacity > 0 && levelData.length >= 2 && levelData.map((d, i) => {
        if (i === 0) return null;
        const prev = levelData[i - 1];
        const bandTop = Math.min(d.y, prev.y);
        const bandBottom = Math.max(d.y, prev.y);
        const bandHeight = bandBottom - bandTop;
        if (bandHeight < 1) return null;
        return (
          <rect
            key={`fill-${d.level}`}
            x={levelStartX}
            y={bandTop}
            width={chartWidth - levelStartX}
            height={bandHeight}
            fill={FILL_COLORS[i % FILL_COLORS.length]}
            fillOpacity={annotation.fillOpacity}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* Connecting lines: P1→P2 (initial move) and P2→P3 (retracement) */}
      {selected && (
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={selectionGlow} strokeWidth={3 + 6} strokeLinecap="round" />
          <line x1={x2} y1={y2} x2={x3} y2={y3}
            stroke={selectionGlow} strokeWidth={3 + 6} strokeLinecap="round" />
        </>
      )}

      {/* Hit areas for connecting lines */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />
      <line x1={x2} y1={y2} x2={x3} y2={y3}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />

      {/* Connecting line P1 → P2 (initial move) */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={annotation.color} strokeWidth={annotation.lineWidth}
        strokeDasharray="6 4" strokeLinecap="round" opacity={0.7} />

      {/* Connecting line P2 → P3 (retracement) */}
      <line x1={x2} y1={y2} x2={x3} y2={y3}
        stroke={annotation.color} strokeWidth={annotation.lineWidth}
        strokeDasharray="6 4" strokeLinecap="round" opacity={0.7} />

      {/* Extension level lines */}
      {levelData.map((d) => {
        const isKeyLevel = d.level === 1 || d.level === 1.618 || d.level === 0;
        const levelOpacity = isKeyLevel ? 1 : 0.7;
        const levelWidth = isKeyLevel
          ? annotation.lineWidth * 1.5
          : annotation.lineWidth;

        return (
          <g key={`level-${d.level}`}>
            {/* Selection glow for levels */}
            {selected && (
              <line
                x1={levelStartX}
                x2={chartWidth}
                y1={d.y}
                y2={d.y}
                stroke={selectionGlow}
                strokeWidth={levelWidth + 6}
                strokeLinecap="round"
              />
            )}

            {/* Hit area */}
            <line
              x1={levelStartX}
              x2={chartWidth}
              y1={d.y}
              y2={d.y}
              stroke="transparent"
              strokeWidth={HIT_AREA_WIDTH}
              style={{ cursor: 'pointer' }}
              onMouseDown={selected ? handleWholeMouseDown : undefined}
            />

            {/* Level line */}
            <line
              x1={levelStartX}
              x2={chartWidth}
              y1={d.y}
              y2={d.y}
              stroke={annotation.color}
              strokeWidth={levelWidth}
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              opacity={levelOpacity}
            />

            {/* Level label on the right */}
            {(() => {
              const levelLabel = getLevelLabel(d.level);
              const priceLabel = annotation.showPrices ? ` (${formatPrice(d.price)})` : '';
              const fullLabel = `${levelLabel}${priceLabel}`;
              const labelWidth = Math.max(60, fullLabel.length * 6.5 + 16);

              return (
                <g>
                  <rect
                    x={chartWidth - labelWidth - 8}
                    y={d.y - 10}
                    width={labelWidth}
                    height={20}
                    fill={labelBg}
                    fillOpacity={0.9}
                    rx={3}
                    stroke={annotation.color}
                    strokeWidth={0.5}
                    strokeOpacity={0.5}
                  />
                  <text
                    x={chartWidth - labelWidth / 2 - 8}
                    y={d.y}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize={10}
                    fill={annotation.color}
                    fontWeight={isKeyLevel ? 600 : 400}
                    fontFamily="monospace"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {fullLabel}
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* Annotation label at P3 */}
      {annotation.label && (
        <g>
          <rect
            x={x3 + 8}
            y={y3 - 10}
            width={Math.max(30, annotation.label.length * 7 + 16)}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={x3 + 8 + Math.max(30, annotation.label.length * 7 + 16) / 2}
            y={y3}
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {annotation.label}
          </text>
        </g>
      )}

      {/* Anchor handles (when selected) */}
      {selected && (
        <>
          {/* P1 — Start of move */}
          <circle cx={x1} cy={y1} r={HANDLE_RADIUS}
            fill={handleColor} fillOpacity={0.9}
            stroke={annotation.color} strokeWidth={2}
            onMouseDown={handleP1MouseDown} style={{ cursor: 'move' }} />
          <text x={x1} y={y1 - HANDLE_RADIUS - 4}
            textAnchor="middle" fontSize={9} fill={annotation.color}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            1
          </text>

          {/* P2 — End of move */}
          <circle cx={x2} cy={y2} r={HANDLE_RADIUS}
            fill={handleColor} fillOpacity={0.9}
            stroke={annotation.color} strokeWidth={2}
            onMouseDown={handleP2MouseDown} style={{ cursor: 'move' }} />
          <text x={x2} y={y2 - HANDLE_RADIUS - 4}
            textAnchor="middle" fontSize={9} fill={annotation.color}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            2
          </text>

          {/* P3 — End of retracement */}
          <circle cx={x3} cy={y3} r={HANDLE_RADIUS}
            fill={handleColor} fillOpacity={0.9}
            stroke={annotation.color} strokeWidth={2}
            onMouseDown={handleP3MouseDown} style={{ cursor: 'move' }} />
          <text x={x3} y={y3 - HANDLE_RADIUS - 4}
            textAnchor="middle" fontSize={9} fill={annotation.color}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            3
          </text>
        </>
      )}
    </g>
  );
};

/** Format price for level labels */
function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '';
  if (Math.abs(price) < 1) return price.toPrecision(4);
  if (Math.abs(price) < 10) return price.toFixed(4);
  return price.toFixed(2);
}

export default FibExtensionAnnotationView;
