import React, { useCallback, useEffect, useRef } from 'react';
import type { PitchforkAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex, LINE_STYLE_MAP, resolveX } from './annotationUtils';
import { HANDLE_RADIUS, HANDLE_RADIUS_SMALL, HIT_AREA_WIDTH } from './annotationConstants';

export interface PitchforkAnnotationViewProps {
  annotation: PitchforkAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<PitchforkAnnotation>) => void;
  timeToIndex?: (time: number) => number | undefined;
  indexToTime?: (index: number) => number;
  dataLength?: number;
  compressedTimes?: number[];
}

/**
 * Extend a ray from (x1,y1) in the direction towards (x2,y2) to the chart boundary.
 */
const extendToEdge = (
  x1: number, y1: number,
  x2: number, y2: number,
  chartWidth: number,
  paneHeight: number,
): { x: number; y: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return { x: x2, y: y2 };

  // Extend in direction of (dx, dy) from (x1,y1) until we hit a chart boundary
  let tMax = Infinity;

  if (dx > 0) {
    tMax = Math.min(tMax, (chartWidth - x1) / dx);
  } else if (dx < 0) {
    tMax = Math.min(tMax, -x1 / dx);
  }

  if (dy > 0) {
    tMax = Math.min(tMax, (paneHeight - y1) / dy);
  } else if (dy < 0) {
    tMax = Math.min(tMax, -y1 / dy);
  }

  if (!Number.isFinite(tMax) || tMax < 0) tMax = 1;

  return {
    x: x1 + dx * tMax,
    y: y1 + dy * tMax,
  };
};

const PitchforkAnnotationView: React.FC<PitchforkAnnotationViewProps> = ({
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

    let startXValue: number;
    if (tti && iti && dl > 0) {
      const index = findClosestIndex(startTime, ct, tti);
      if (index === undefined) {
        // Can't find a valid index, use the original time as fallback
        startXValue = startTime;
      } else {
        startXValue = index;
      }
    } else {
      startXValue = startTime;
    }
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

  // --- Whole pitchfork drag ---
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

  // Resolve pixel positions for all three points
  const x1 = resolveX(annotation.time1, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x2 = resolveX(annotation.time2, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);
  const x3 = resolveX(annotation.time3, xScale, timeToIndex, indexToTime, dataLength, compressedTimes);

  if (x1 === undefined || x2 === undefined || x3 === undefined) return null;

  const y1 = yScale.scale(annotation.price1);
  const y2 = yScale.scale(annotation.price2);
  const y3 = yScale.scale(annotation.price3);

  if (!Number.isFinite(y1) || !Number.isFinite(y2) || !Number.isFinite(y3)) return null;

  // Midpoint of P2–P3 (the median line target)
  const midX = (x2 + x3) / 2;
  const midY = (y2 + y3) / 2;

  // Direction vector for the median line: from P1 towards midpoint(P2, P3)
  const medDx = midX - x1;
  const medDy = midY - y1;

  // Compute extended endpoints for the three prongs
  const computeLineEndpoints = (startX: number, startY: number, dirX: number, dirY: number) => {
    if (annotation.extendRight) {
      const end = extendToEdge(startX, startY, startX + dirX, startY + dirY, chartWidth, paneHeight);
      return { endX: end.x, endY: end.y };
    }
    // Default: extend to the same parametric t as the median reaches midpoint (t=1)
    // But also extend beyond to make the fork useful
    const end = extendToEdge(startX, startY, startX + dirX, startY + dirY, chartWidth, paneHeight);
    // Only extend to 2x the base length, or chart edge, whichever is shorter
    const baseLen = Math.sqrt(dirX * dirX + dirY * dirY);
    if (baseLen === 0) return { endX: startX, endY: startY };
    const edgeLen = Math.sqrt((end.x - startX) ** 2 + (end.y - startY) ** 2);
    const clampLen = Math.min(edgeLen, baseLen * 2);
    const t = clampLen / baseLen;
    return {
      endX: startX + dirX * t,
      endY: startY + dirY * t,
    };
  };

  // Median line: P1 → midpoint(P2,P3), extended
  const medianEnd = computeLineEndpoints(x1, y1, medDx, medDy);

  // Upper parallel: through P2, parallel to median direction
  const upperEnd = computeLineEndpoints(x2, y2, medDx, medDy);

  // Lower parallel: through P3, parallel to median direction
  const lowerEnd = computeLineEndpoints(x3, y3, medDx, medDy);

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Fill polygon: upper prong start → upper prong end → lower prong end → lower prong start
  const fillPoints = `${x2},${y2} ${upperEnd.endX},${upperEnd.endY} ${lowerEnd.endX},${lowerEnd.endY} ${x3},${y3}`;

  return (
    <g
      className="pitchfork-annotation"
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Semi-transparent fill between upper and lower parallels */}
      <polygon
        points={fillPoints}
        fill={annotation.color}
        fillOpacity={annotation.fillOpacity}
        stroke="none"
        onMouseDown={selected ? handleWholeMouseDown : undefined}
        style={{ cursor: selected ? 'grab' : 'pointer' }}
      />

      {/* Selection glow */}
      {selected && (
        <>
          <line x1={x1} y1={y1} x2={medianEnd.endX} y2={medianEnd.endY}
            stroke={selectionGlow} strokeWidth={annotation.lineWidth + 6} strokeLinecap="round" />
          <line x1={x2} y1={y2} x2={upperEnd.endX} y2={upperEnd.endY}
            stroke={selectionGlow} strokeWidth={annotation.lineWidth + 6} strokeLinecap="round" />
          <line x1={x3} y1={y3} x2={lowerEnd.endX} y2={lowerEnd.endY}
            stroke={selectionGlow} strokeWidth={annotation.lineWidth + 6} strokeLinecap="round" />
        </>
      )}

      {/* Hit areas (invisible, wider for easier clicking) */}
      <line x1={x1} y1={y1} x2={medianEnd.endX} y2={medianEnd.endY}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />
      <line x1={x2} y1={y2} x2={upperEnd.endX} y2={upperEnd.endY}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />
      <line x1={x3} y1={y3} x2={lowerEnd.endX} y2={lowerEnd.endY}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />
      {/* Connecting lines P1→P2 and P1→P3 (for easier hitting) */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />
      <line x1={x1} y1={y1} x2={x3} y2={y3}
        stroke="transparent" strokeWidth={HIT_AREA_WIDTH} style={{ cursor: 'pointer' }}
        onMouseDown={selected ? handleWholeMouseDown : undefined} />

      {/* Median line (P1 → midpoint extended) */}
      <line x1={x1} y1={y1} x2={medianEnd.endX} y2={medianEnd.endY}
        stroke={annotation.color} strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray} strokeLinecap="round" />

      {/* Upper parallel (through P2) */}
      <line x1={x2} y1={y2} x2={upperEnd.endX} y2={upperEnd.endY}
        stroke={annotation.color} strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray} strokeLinecap="round" />

      {/* Lower parallel (through P3) */}
      <line x1={x3} y1={y3} x2={lowerEnd.endX} y2={lowerEnd.endY}
        stroke={annotation.color} strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray} strokeLinecap="round" />

      {/* Connecting lines: P1 → P2 and P1 → P3 (the "handle" of the fork) */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={annotation.color} strokeWidth={annotation.lineWidth * 0.75}
        strokeDasharray="4 3" strokeLinecap="round" opacity={0.5} />
      <line x1={x1} y1={y1} x2={x3} y2={y3}
        stroke={annotation.color} strokeWidth={annotation.lineWidth * 0.75}
        strokeDasharray="4 3" strokeLinecap="round" opacity={0.5} />

      {/* Label at the median midpoint */}
      {annotation.label && (
        <g>
          <rect
            x={midX - annotation.label.length * 3.5 - 8}
            y={midY - 10}
            width={Math.max(30, annotation.label.length * 7 + 16)}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={midX} y={midY}
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

      {/* Handles (when selected) */}
      {selected && (
        <>
          {/* P1 — Pivot */}
          <circle cx={x1} cy={y1} r={HANDLE_RADIUS}
            fill={handleColor} fillOpacity={0.9}
            stroke={annotation.color} strokeWidth={2}
            onMouseDown={handleP1MouseDown} style={{ cursor: 'move' }} />
          {/* P2 — Upper anchor */}
          <circle cx={x2} cy={y2} r={HANDLE_RADIUS}
            fill={handleColor} fillOpacity={0.9}
            stroke={annotation.color} strokeWidth={2}
            onMouseDown={handleP2MouseDown} style={{ cursor: 'move' }} />
          {/* P3 — Lower anchor */}
          <circle cx={x3} cy={y3} r={HANDLE_RADIUS}
            fill={handleColor} fillOpacity={0.9}
            stroke={annotation.color} strokeWidth={2}
            onMouseDown={handleP3MouseDown} style={{ cursor: 'move' }} />
          {/* Whole drag handle at median midpoint */}
          <circle cx={midX} cy={midY} r={HANDLE_RADIUS_SMALL}
            fill={annotation.color} fillOpacity={0.6}
            onMouseDown={handleWholeMouseDown} style={{ cursor: 'grab' }} />
        </>
      )}
    </g>
  );
};

export default PitchforkAnnotationView;
