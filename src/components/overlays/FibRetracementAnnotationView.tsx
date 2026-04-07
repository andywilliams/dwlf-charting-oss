import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type {
  FibRetracementAnnotation,
  PaneComputedScale,
  XScale,
} from '../../charting/types';
import { FIB_LEVELS_DEFAULT, FIB_EXTENSIONS_DEFAULT } from '../../charting/types';
import { findClosestTime } from '../../charting/scales';
import useAnnotationDrag from './useAnnotationDrag';
import { HANDLE_RADIUS, HANDLE_RADIUS_SMALL, HIT_AREA_WIDTH } from './annotationConstants';

export interface FibRetracementAnnotationViewProps {
  annotation: FibRetracementAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<FibRetracementAnnotation>) => void;
  timeToIndex?: (time: number) => number | undefined;
  indexToTime?: (index: number) => number;
  dataLength?: number;
  compressedTimes?: number[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

const LINE_STYLE_MAP: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 4',
};

/** Alternating fill colors (lighter version of the main color) */
const FILL_COLORS = [
  'rgba(239,68,68,0.08)',   // warm
  'rgba(59,130,246,0.06)',  // cool
];

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

const formatPercent = (ratio: number): string => {
  const pct = ratio * 100;
  // Clean up float issues: 23.6, 38.2, etc.
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
};

const formatPrice = (price: number): string => {
  if (Math.abs(price) < 1) return price.toPrecision(4);
  if (Math.abs(price) < 10) return price.toFixed(4);
  return price.toFixed(2);
};

// ─── Component ───────────────────────────────────────────────────────

const FibRetracementAnnotationView: React.FC<FibRetracementAnnotationViewProps> = ({
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
  const [dragTarget, setDragTarget] = useState<null | 1 | 2 | 'whole'>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartData = useRef<{
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

  // ── Pixel → data conversion ───────────────────────────────────────
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

  // ── Endpoint 1 drag ───────────────────────────────────────────────
  const handleP1DragStart = useCallback((e: React.MouseEvent) => {
    setDragTarget(1);
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
    onDragStart: handleP1DragStart,
    onDragMove: handleP1DragMove,
    onDragEnd: () => setDragTarget(null),
  });

  // ── Endpoint 2 drag ───────────────────────────────────────────────
  const handleP2DragStart = useCallback((e: React.MouseEvent) => {
    setDragTarget(2);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2]);

  const handleP2DragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const { time, price } = pixelToData(
      dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY,
    );
    onMove?.(annotation.id, { time2: time, price2: price });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingP2, handleMouseDown: handleP2MouseDown } = useAnnotationDrag({
    onDragStart: handleP2DragStart,
    onDragMove: handleP2DragMove,
    onDragEnd: () => setDragTarget(null),
  });

  // ── Whole-fib drag ────────────────────────────────────────────────
  const handleWholeDragStart = useCallback((e: React.MouseEvent) => {
    setDragTarget('whole');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1, price1: annotation.price1,
      time2: annotation.time2, price2: annotation.price2,
    };
  }, [annotation.time1, annotation.price1, annotation.time2, annotation.price2]);

  const handleWholeDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;
    const p1 = pixelToData(dragStartData.current.time1, dragStartData.current.price1, deltaX, deltaY);
    const p2 = pixelToData(dragStartData.current.time2, dragStartData.current.price2, deltaX, deltaY);
    onMove?.(annotation.id, {
      time1: p1.time, price1: p1.price,
      time2: p2.time, price2: p2.price,
    });
  }, [annotation.id, onMove, pixelToData]);

  const { isDragging: isDraggingWhole, handleMouseDown: handleWholeMouseDown } = useAnnotationDrag({
    onDragStart: handleWholeDragStart,
    onDragMove: handleWholeDragMove,
    onDragEnd: () => setDragTarget(null),
  });

  const isDragging = isDraggingP1 || isDraggingP2 || isDraggingWhole;

  // ── Compute layout ────────────────────────────────────────────────

  const x1 = resolveX(annotation.time1, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x2 = resolveX(annotation.time2, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);

  // Compute all fib levels to render
  const allLevels = useMemo(() => {
    const levs = [...(annotation.levels ?? [...FIB_LEVELS_DEFAULT])];
    if (annotation.showExtensions) {
      for (const ext of FIB_EXTENSIONS_DEFAULT) {
        if (!levs.includes(ext)) levs.push(ext);
      }
    }
    levs.sort((a, b) => a - b);
    return levs;
  }, [annotation.levels, annotation.showExtensions]);

  if (x1 === undefined || x2 === undefined) return null;

  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;

  // price1 = 0% level, price2 = 100% level
  // Fib level price = price1 + (price2 - price1) * ratio
  const priceDiff = annotation.price2 - annotation.price1;
  const leftX = Math.min(x1, x2);
  const rightX = annotation.extendRight ? chartWidth : Math.max(x1, x2);
  const regionWidth = rightX - leftX;

  if (regionWidth < 1) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Pre-compute Y positions for each fib level
  const levelYs = allLevels.map((ratio) => {
    const price = annotation.price1 + priceDiff * ratio;
    return { ratio, price, y: yScale.scale(price) };
  });

  return (
    <g
      className="fib-retracement-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Fill bands between adjacent levels */}
      {annotation.fillOpacity > 0 && levelYs.map((level, i) => {
        if (i === 0) return null;
        const prevLevel = levelYs[i - 1];
        const bandTop = Math.min(level.y, prevLevel.y);
        const bandBottom = Math.max(level.y, prevLevel.y);
        const bandHeight = bandBottom - bandTop;
        if (bandHeight < 0.5) return null;
        return (
          <rect
            key={`fill-${level.ratio}`}
            x={leftX}
            y={bandTop}
            width={regionWidth}
            height={bandHeight}
            fill={annotation.color}
            fillOpacity={annotation.fillOpacity * (i % 2 === 0 ? 1 : 0.5)}
            stroke="none"
            onMouseDown={selected ? handleWholeMouseDown : undefined}
            style={{ cursor: selected ? 'grab' : 'pointer' }}
          />
        );
      })}

      {/* Selection glow on boundary lines */}
      {selected && levelYs.map(({ ratio, y }) => (
        <line
          key={`glow-${ratio}`}
          x1={leftX}
          x2={rightX}
          y1={y}
          y2={y}
          stroke={selectionGlow}
          strokeWidth={annotation.lineWidth + 4}
          strokeLinecap="round"
        />
      ))}

      {/* Fib level lines + labels */}
      {levelYs.map(({ ratio, price, y }) => {
        // Skip rendering lines entirely outside visible area
        if (y < -50 || y > paneHeight + 50) return null;

        const pctLabel = formatPercent(ratio);
        const priceLabel = formatPrice(price);
        const labelText = `${pctLabel}  (${priceLabel})`;
        const labelWidth = Math.max(80, labelText.length * 6 + 16);

        // Use a slightly lower opacity for non-key levels
        const isKeyLevel = ratio === 0 || ratio === 0.5 || ratio === 0.618 || ratio === 1;
        const lineOpacity = isKeyLevel ? 1 : 0.7;

        return (
          <g key={`level-${ratio}`}>
            {/* Hit area */}
            <line
              x1={leftX}
              x2={rightX}
              y1={y}
              y2={y}
              stroke="transparent"
              strokeWidth={HIT_AREA_WIDTH}
              style={{ cursor: 'pointer' }}
              onMouseDown={selected ? handleWholeMouseDown : undefined}
            />
            {/* Main level line */}
            <line
              x1={leftX}
              x2={rightX}
              y1={y}
              y2={y}
              stroke={annotation.color}
              strokeWidth={isKeyLevel ? annotation.lineWidth : annotation.lineWidth * 0.7}
              strokeDasharray={isKeyLevel ? undefined : strokeDasharray}
              strokeLinecap="round"
              opacity={lineOpacity}
            />
            {/* Label badge on right side */}
            <g>
              <rect
                x={rightX - labelWidth - 4}
                y={y - 9}
                width={labelWidth}
                height={18}
                fill={annotation.color}
                fillOpacity={isKeyLevel ? 0.85 : 0.65}
                rx={3}
              />
              <text
                x={rightX - labelWidth / 2 - 4}
                y={y}
                dy="0.35em"
                textAnchor="middle"
                fontSize={10}
                fill="white"
                fontWeight={isKeyLevel ? 600 : 400}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {labelText}
              </text>
            </g>
          </g>
        );
      })}

      {/* Vertical boundary lines connecting the two anchor points */}
      <line
        x1={x1} y1={y1} x2={x1} y2={y2}
        stroke={annotation.color}
        strokeWidth={0.5}
        strokeDasharray="4 3"
        opacity={0.5}
      />
      <line
        x1={x2} y1={y1} x2={x2} y2={y2}
        stroke={annotation.color}
        strokeWidth={0.5}
        strokeDasharray="4 3"
        opacity={0.5}
      />

      {/* Diagonal trend line (price1 → price2) */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={annotation.color}
        strokeWidth={1}
        strokeDasharray="6 3"
        opacity={0.6}
      />

      {/* Label */}
      {annotation.label && (
        <g>
          <rect
            x={leftX + 4}
            y={Math.min(y1, y2) - 20}
            width={Math.max(40, annotation.label.length * 7 + 12)}
            height={16}
            fill={annotation.color}
            fillOpacity={0.85}
            rx={3}
          />
          <text
            x={leftX + 4 + Math.max(40, annotation.label.length * 7 + 12) / 2}
            y={Math.min(y1, y2) - 12}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fill="white"
            fontWeight={600}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {annotation.label}
          </text>
        </g>
      )}

      {/* Drag handles (when selected) */}
      {selected && (
        <>
          {/* Endpoint 1 (typically the swing high/start) */}
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
          {/* Endpoint 2 (typically the swing low/end) */}
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
          {/* Whole-fib drag handle at center */}
          <circle
            cx={(x1 + x2) / 2}
            cy={(y1 + y2) / 2}
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

export default FibRetracementAnnotationView;
