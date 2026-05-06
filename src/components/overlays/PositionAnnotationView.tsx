import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LongPositionAnnotation,
  ShortPositionAnnotation,
  PaneComputedScale,
  XScale,
} from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex } from './annotationUtils';
import { RECT_HIT_PADDING } from './annotationConstants';
import { SelectionGlow } from './primitives';

type PositionAnnotation = LongPositionAnnotation | ShortPositionAnnotation;

export interface PositionAnnotationViewProps {
  annotation: PositionAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onDoubleClick?: (id: string) => void;
  onMove?: (id: string, update: Partial<PositionAnnotation>) => void;
  timeToIndex?: (time: number) => number | undefined;
  indexToTime?: (index: number) => number;
  dataLength?: number;
  compressedTimes?: number[];
}

const formatPrice = (price: number): string => {
  if (Math.abs(price) < 0.01) return price.toPrecision(3);
  if (Math.abs(price) < 1) return price.toPrecision(4);
  if (Math.abs(price) < 10) return price.toFixed(4);
  if (Math.abs(price) < 1000) return price.toFixed(2);
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PositionAnnotationView: React.FC<PositionAnnotationViewProps> = ({
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
}) => {
  const isLong = annotation.type === 'long_position';
  const isPreview = annotation.id?.startsWith('_preview') ?? false;

  // Show the info badge only when the annotation is being hovered or is
  // selected. Keeps the chart uncluttered when there are several positions
  // sitting on it.
  const [hovered, setHovered] = useState(false);
  const showBadge = isPreview || selected || hovered;

  // ----- Drag refs / scale refs -----
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartData = useRef<{
    time1: number; time2: number;
    entryPrice: number; stopPrice: number; targetPrice: number;
  }>({ time1: 0, time2: 0, entryPrice: 0, stopPrice: 0, targetPrice: 0 });
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

  // ----- Selection / double-click -----
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(annotation.id);
  }, [annotation.id, onDoubleClick]);

  // ----- Drag start: snapshot all coords -----
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartData.current = {
      time1: annotation.time1,
      time2: annotation.time2,
      entryPrice: annotation.entryPrice,
      stopPrice: annotation.stopPrice,
      targetPrice: annotation.targetPrice,
    };
  }, [annotation.time1, annotation.time2, annotation.entryPrice, annotation.stopPrice, annotation.targetPrice]);

  // ----- Helpers: pixel↔data conversion -----
  const screenToTime = useCallback((startTime: number, deltaX: number): number => {
    const xS = xScaleRef.current;
    const t2i = timeToIndexRef.current;
    const i2t = indexToTimeRef.current;
    const ct = compressedTimesRef.current;
    const dl = dataLengthRef.current;
    const startXValue = (t2i && i2t && dl > 0)
      ? (findClosestIndex(startTime, ct, t2i) ?? startTime)
      : startTime;
    const newX = xS(startXValue) + deltaX;
    if (!xS.invert) return startTime;
    const inverted = xS.invert(newX);
    const raw = inverted instanceof Date ? inverted.getTime() : (inverted as number);
    return (t2i && i2t && dl > 0) ? i2t(Math.round(raw)) : raw;
  }, []);

  const screenToPrice = useCallback((startPrice: number, deltaY: number): number => {
    const yS = yScaleRef.current;
    return yS.invert(yS.scale(startPrice) + deltaY);
  }, []);

  // ----- Per-handle drag move handlers -----
  const moveTarget = useCallback((e: MouseEvent) => {
    const dy = e.clientY - dragStartPos.current.y;
    const next = screenToPrice(dragStartData.current.targetPrice, dy);
    if (Number.isFinite(next)) onMove?.(annotation.id, { targetPrice: next });
  }, [annotation.id, onMove, screenToPrice]);

  const moveStop = useCallback((e: MouseEvent) => {
    const dy = e.clientY - dragStartPos.current.y;
    const next = screenToPrice(dragStartData.current.stopPrice, dy);
    if (Number.isFinite(next)) onMove?.(annotation.id, { stopPrice: next });
  }, [annotation.id, onMove, screenToPrice]);

  const moveEntry = useCallback((e: MouseEvent) => {
    const dy = e.clientY - dragStartPos.current.y;
    const next = screenToPrice(dragStartData.current.entryPrice, dy);
    if (Number.isFinite(next)) onMove?.(annotation.id, { entryPrice: next });
  }, [annotation.id, onMove, screenToPrice]);

  // The right-edge bar drags whichever time field is visually on the right
  // at drag start (time2 in normal orientation; time1 if a previous drag
  // pushed time2 to the left of time1). Without this, dragging through the
  // opposite boundary attaches the visible handle to the hidden field.
  const moveRightEdge = useCallback((e: MouseEvent) => {
    const dx = e.clientX - dragStartPos.current.x;
    const start = dragStartData.current;
    const rightField: 'time1' | 'time2' = start.time2 >= start.time1 ? 'time2' : 'time1';
    const startTime = rightField === 'time2' ? start.time2 : start.time1;
    const next = screenToTime(startTime, dx);
    if (Number.isFinite(next)) onMove?.(annotation.id, { [rightField]: next });
  }, [annotation.id, onMove, screenToTime]);

  const moveBody = useCallback((e: MouseEvent) => {
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const t1 = screenToTime(dragStartData.current.time1, dx);
    const t2 = screenToTime(dragStartData.current.time2, dx);
    const entry = screenToPrice(dragStartData.current.entryPrice, dy);
    const stop = screenToPrice(dragStartData.current.stopPrice, dy);
    const target = screenToPrice(dragStartData.current.targetPrice, dy);
    if ([t1, t2, entry, stop, target].every(Number.isFinite)) {
      onMove?.(annotation.id, {
        time1: t1, time2: t2,
        entryPrice: entry, stopPrice: stop, targetPrice: target,
      });
    }
  }, [annotation.id, onMove, screenToTime, screenToPrice]);

  const { isDragging: isDraggingTarget, handleMouseDown: targetMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart, onDragMove: moveTarget,
  });
  const { isDragging: isDraggingStop, handleMouseDown: stopMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart, onDragMove: moveStop,
  });
  const { isDragging: isDraggingEntry, handleMouseDown: entryMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart, onDragMove: moveEntry,
  });
  const { isDragging: isDraggingRight, handleMouseDown: rightMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart, onDragMove: moveRightEdge,
  });
  const { isDragging: isDraggingBody, handleMouseDown: bodyMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart, onDragMove: moveBody,
  });
  const isDragging = isDraggingTarget || isDraggingStop || isDraggingEntry
    || isDraggingRight || isDraggingBody;

  // ----- Geometry -----
  const getX = (time: number): number | undefined => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) return timeToIndex(time);
    return undefined;
  };
  const xVal1 = getX(annotation.time1);
  const xVal2 = getX(annotation.time2);
  if (timeToIndex && (xVal1 === undefined || xVal2 === undefined)) return null;

  const x1 = xScale(xVal1 ?? annotation.time1);
  const x2 = xScale(xVal2 ?? annotation.time2);
  const yEntry = yScale.scale(annotation.entryPrice);
  const yStop = yScale.scale(annotation.stopPrice);
  const yTarget = yScale.scale(annotation.targetPrice);
  if (![x1, x2, yEntry, yStop, yTarget].every(Number.isFinite)) return null;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const rectWidth = Math.max(right - left, 1);
  // Top of overall shape = whichever price is highest visually (lowest y).
  const yMin = Math.min(yStop, yTarget);
  const yMax = Math.max(yStop, yTarget);
  const totalHeight = Math.max(yMax - yMin, 1);

  // Off-screen culling
  if (right < -50 || left > chartWidth + 50 || yMax < -50 || yMin > paneHeight + 50) return null;

  // ----- R/R math -----
  const risk = Math.abs(annotation.entryPrice - annotation.stopPrice);
  const reward = Math.abs(annotation.targetPrice - annotation.entryPrice);
  const rrRatio = risk > 0 ? reward / risk : 0;
  const riskPct = annotation.entryPrice !== 0 ? (risk / annotation.entryPrice) * 100 : 0;
  const rewardPct = annotation.entryPrice !== 0 ? (reward / annotation.entryPrice) * 100 : 0;

  const REWARD_FILL = 'rgba(34, 197, 94, 0.18)';   // green
  const RISK_FILL = 'rgba(239, 68, 68, 0.18)';     // red
  const REWARD_STROKE = '#22c55e';
  const RISK_STROKE = '#ef4444';
  const ENTRY_COLOR = darkMode ? '#e2e8f0' : '#1f2937';

  // For long: entry sits between target (top, green) and stop (bottom, red).
  // For short: entry sits between stop (top, red) and target (bottom, green).
  const upperFill = isLong ? REWARD_FILL : RISK_FILL;
  const lowerFill = isLong ? RISK_FILL : REWARD_FILL;
  const upperStroke = isLong ? REWARD_STROKE : RISK_STROKE;
  const lowerStroke = isLong ? RISK_STROKE : REWARD_STROKE;

  // The two zones split at the entry line.
  const upperTop = yMin;
  const upperHeight = Math.max(yEntry - yMin, 0);
  const lowerTop = yEntry;
  const lowerHeight = Math.max(yMax - yEntry, 0);

  // ----- Info badge content -----
  const rrLabel = `${(rrRatio || 0).toFixed(2)}R`;
  const riskLabel = `${formatPrice(risk)} (${riskPct.toFixed(2)}%)`;
  const rewardLabel = `+${formatPrice(reward)} (${rewardPct.toFixed(2)}%)`;
  const sizeLabel = annotation.size != null ? `${formatPrice(annotation.size)} units` : null;
  const longShortLabel = isLong ? 'LONG' : 'SHORT';

  const badgeLines = [
    `${longShortLabel}  •  ${rrLabel}`,
    `risk  ${riskLabel}`,
    `target  ${rewardLabel}`,
    ...(sizeLabel ? [sizeLabel] : []),
  ];
  const badgeFontSize = 11;
  const badgeLineHeight = 14;
  const badgeWidth = Math.max(120, ...badgeLines.map(l => l.length * 6.5)) + 16;
  const badgeHeight = badgeLines.length * badgeLineHeight + 12;
  const badgeCx = (left + right) / 2;
  const badgeCy = yEntry;
  let badgeX = badgeCx - badgeWidth / 2;
  let badgeY = badgeCy - badgeHeight / 2;
  if (badgeX < 4) badgeX = 4;
  if (badgeX + badgeWidth > chartWidth - 4) badgeX = chartWidth - badgeWidth - 4;
  if (badgeY < 4) badgeY = 4;
  if (badgeY + badgeHeight > paneHeight - 4) badgeY = paneHeight - badgeHeight - 4;

  const RIGHT_HANDLE_W = 6;

  return (
    <g
      className={isLong ? 'long-position-annotation' : 'short-position-annotation'}
      onClick={isPreview ? undefined : handleClick}
      onDoubleClick={isPreview ? undefined : handleDoubleClick}
      onMouseEnter={isPreview ? undefined : () => setHovered(true)}
      onMouseLeave={isPreview ? undefined : () => setHovered(false)}
      style={{
        cursor: isDragging ? 'grabbing' : 'pointer',
        // Preview ghost is non-interactive so the second placement click
        // reaches the chart canvas commit handler.
        pointerEvents: isPreview ? 'none' : 'auto',
      }}
    >
      {/* Selection glow around the bounding rect */}
      {selected && (
        <rect
          x={left - 3}
          y={yMin - 3}
          width={rectWidth + 6}
          height={totalHeight + 6}
          fill="none"
          stroke={darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)'}
          strokeWidth={3}
          rx={2}
        />
      )}

      {/* Body click target (also drives whole-translation when selected). */}
      <rect
        x={left - RECT_HIT_PADDING}
        y={yMin - RECT_HIT_PADDING}
        width={rectWidth + RECT_HIT_PADDING * 2}
        height={totalHeight + RECT_HIT_PADDING * 2}
        fill="transparent"
        style={{ cursor: selected ? (isDragging ? 'grabbing' : 'move') : 'pointer' }}
        onClick={selected ? undefined : handleClick}
        onMouseDown={selected ? bodyMouseDown : undefined}
      />

      {/* Upper zone fill */}
      {upperHeight > 0 && (
        <rect
          x={left}
          y={upperTop}
          width={rectWidth}
          height={upperHeight}
          fill={upperFill}
          stroke={upperStroke}
          strokeWidth={1}
          strokeOpacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Lower zone fill */}
      {lowerHeight > 0 && (
        <rect
          x={left}
          y={lowerTop}
          width={rectWidth}
          height={lowerHeight}
          fill={lowerFill}
          stroke={lowerStroke}
          strokeWidth={1}
          strokeOpacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Entry line (draggable along Y) */}
      <line
        x1={left}
        x2={right}
        y1={yEntry}
        y2={yEntry}
        stroke={ENTRY_COLOR}
        strokeWidth={1.5}
        strokeDasharray="6 3"
        opacity={0.85}
        style={{ pointerEvents: 'none' }}
      />
      {/* Entry hit area / drag */}
      <line
        x1={left}
        x2={right}
        y1={yEntry}
        y2={yEntry}
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: isDraggingEntry ? 'grabbing' : 'ns-resize' }}
        onMouseDown={entryMouseDown}
      />

      {/* Top/bottom edges bind to whichever price field is currently at that
          screen position, not by long/short direction. Without this, dragging
          target through stop (or vice versa) leaves the visible top handle
          editing the hidden bottom price and the resize appears stuck. */}
      <line
        x1={left}
        x2={right}
        y1={yMin}
        y2={yMin}
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: isDraggingTarget || isDraggingStop ? 'grabbing' : 'ns-resize' }}
        onMouseDown={annotation.targetPrice >= annotation.stopPrice ? targetMouseDown : stopMouseDown}
      />
      <line
        x1={left}
        x2={right}
        y1={yMax}
        y2={yMax}
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: isDraggingTarget || isDraggingStop ? 'grabbing' : 'ns-resize' }}
        onMouseDown={annotation.targetPrice >= annotation.stopPrice ? stopMouseDown : targetMouseDown}
      />

      {/* Right-edge time bar — always visible (not just when selected) so
          the user can extend the position's time without first selecting.
          Spans the full height of the position with a slim coloured bar. */}
      {!isPreview && (
        <>
          {/* Hit-area strip (wider, transparent) */}
          <rect
            x={right - RIGHT_HANDLE_W}
            y={yMin}
            width={RIGHT_HANDLE_W * 2}
            height={totalHeight}
            fill="transparent"
            style={{ cursor: isDraggingRight ? 'grabbing' : 'ew-resize' }}
            onMouseDown={rightMouseDown}
          />
          {/* Visible bar */}
          <rect
            x={right - 1}
            y={yMin}
            width={2}
            height={totalHeight}
            fill={ENTRY_COLOR}
            fillOpacity={selected || hovered ? 0.9 : 0.5}
            style={{ pointerEvents: 'none' }}
          />
          {/* Grip dots in middle of bar */}
          <circle
            cx={right}
            cy={yEntry - 4}
            r={1.5}
            fill={ENTRY_COLOR}
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={right}
            cy={yEntry + 4}
            r={1.5}
            fill={ENTRY_COLOR}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}

      {/* Selection glow on entry line */}
      {selected && (
        <SelectionGlow
          x1={left}
          x2={right}
          y1={yEntry}
          y2={yEntry}
          lineWidth={1.5}
          darkMode={darkMode}
          extraWidth={4}
        />
      )}

      {/* Info badge — only when hovered, selected, or being placed */}
      {showBadge && (
        <g style={{ pointerEvents: 'none' }}>
          <rect
            x={badgeX}
            y={badgeY}
            width={badgeWidth}
            height={badgeHeight}
            fill={darkMode ? 'rgba(15, 23, 42, 0.92)' : 'rgba(30, 30, 30, 0.92)'}
            rx={6}
            stroke={isLong ? REWARD_STROKE : RISK_STROKE}
            strokeWidth={1}
            strokeOpacity={0.6}
          />
          {badgeLines.map((line, i) => (
            <text
              key={i}
              x={badgeX + badgeWidth / 2}
              y={badgeY + 8 + i * badgeLineHeight + badgeLineHeight / 2}
              dy="0.35em"
              textAnchor="middle"
              fontSize={badgeFontSize}
              fontFamily="monospace"
              fontWeight={i === 0 ? 700 : 400}
              fill={i === 0 ? (isLong ? '#4ade80' : '#f87171') : (darkMode ? '#cbd5e1' : '#cbd5e1')}
              style={{ userSelect: 'none' }}
            >
              {line}
            </text>
          ))}
        </g>
      )}

      {/* Price labels at the three levels (right side). Target is always
          the reward leg (green) and stop is always the risk leg (red),
          regardless of long/short direction — colour matches the fill zone
          on the same side of entry. */}
      {[
        { y: yTarget, label: formatPrice(annotation.targetPrice), color: REWARD_STROKE },
        { y: yEntry, label: formatPrice(annotation.entryPrice), color: ENTRY_COLOR },
        { y: yStop, label: formatPrice(annotation.stopPrice), color: RISK_STROKE },
      ].map(({ y, label, color }, idx) => (
        <g key={idx} style={{ pointerEvents: 'none' }}>
          <rect
            x={right + 4}
            y={y - 9}
            width={70}
            height={18}
            fill={darkMode ? 'rgba(15, 23, 42, 0.92)' : 'rgba(30, 30, 30, 0.92)'}
            rx={3}
            stroke={color}
            strokeWidth={0.6}
            strokeOpacity={0.6}
          />
          <text
            x={right + 39}
            y={y}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fontFamily="monospace"
            fill={darkMode ? '#e2e8f0' : '#e2e8f0'}
            style={{ userSelect: 'none' }}
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  );
};

export default PositionAnnotationView;
