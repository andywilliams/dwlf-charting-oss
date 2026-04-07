import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { BrushAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { findClosestTime } from '../../charting/scales';
import useAnnotationDrag from './useAnnotationDrag';
import { HIT_AREA_WIDTH, DRAG_HANDLE_SIZE } from './annotationConstants';

export interface BrushAnnotationViewProps {
  annotation: BrushAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onDoubleClick?: (id: string) => void;
  onMove?: (id: string, update: Partial<BrushAnnotation>) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

/**
 * Resolve a time value to an x-pixel coordinate, handling compressGaps mode.
 */
const resolveX = (
  time: number,
  xScale: XScale,
  timeToIndex: ((t: number) => number | undefined) | undefined,
  compressedTimes: number[] | undefined,
): number | undefined => {
  if (timeToIndex) {
    let idx = timeToIndex(time);
    if (idx === undefined && compressedTimes && compressedTimes.length > 0) {
      const closest = findClosestTime(compressedTimes, time);
      if (Number.isFinite(closest)) {
        idx = timeToIndex(closest);
      }
    }
    if (idx === undefined) return undefined;
    const x = xScale(idx);
    return Number.isFinite(x) ? x : undefined;
  }
  const x = xScale(time);
  return Number.isFinite(x) ? x : undefined;
};

const BrushAnnotationView: React.FC<BrushAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  darkMode = false,
  selected = false,
  onSelect,
  onDoubleClick,
  onMove,
  timeToIndex,
  indexToTime,
  compressedTimes,
}) => {
  const dragStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPoints = useRef<BrushAnnotation['points']>([]);
  const xScaleRef = useRef(xScale);
  const yScaleRef = useRef(yScale);

  useEffect(() => {
    xScaleRef.current = xScale;
    yScaleRef.current = yScale;
  }, [xScale, yScale]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(annotation.id);
  }, [annotation.id, onDoubleClick]);

  // Build SVG path string from points
  const pathData = useMemo(() => {
    const { points } = annotation;
    if (!points || points.length < 2) return '';

    const segments: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const px = resolveX(points[i].t, xScale, timeToIndex, compressedTimes);
      const py = yScale.scale(points[i].v);
      if (px === undefined || !Number.isFinite(py)) continue;
      segments.push(segments.length === 0 ? `M${px},${py}` : `L${px},${py}`);
    }
    return segments.join(' ');
  }, [annotation, xScale, yScale, timeToIndex, compressedTimes]);

  // Compute bounding box for hit testing
  const bounds = useMemo(() => {
    const { points } = annotation;
    if (!points || points.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of points) {
      const px = resolveX(pt.t, xScale, timeToIndex, compressedTimes);
      const py = yScale.scale(pt.v);
      if (px === undefined || !Number.isFinite(py)) continue;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minY, maxY };
  }, [annotation, xScale, yScale, timeToIndex, compressedTimes]);

  // Drag handler — moves all points by the pixel delta
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    dragStartPoints.current = annotation.points.map((p) => ({ ...p }));
  }, [annotation.points]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const dx = moveEvent.clientX - dragStartMouse.current.x;
    const dy = moveEvent.clientY - dragStartMouse.current.y;
    const scale = yScaleRef.current;
    const xs = xScaleRef.current;

    // Convert pixel deltas to data deltas using the first point as reference
    const original = dragStartPoints.current;
    if (!original.length) return;

    let ref: BrushAnnotation['points'][number] | undefined;
    let refX: number | undefined;
    let refY: number | undefined;
    for (const point of original) {
      const pointX = resolveX(point.t, xs, timeToIndex, compressedTimes);
      const pointY = scale.scale(point.v);
      if (pointX !== undefined && Number.isFinite(pointY)) {
        ref = point;
        refX = pointX;
        refY = pointY;
        break;
      }
    }
    if (!ref || refX === undefined || refY === undefined) return;

    const newRefY = scale.invert(refY + dy);
    if (!Number.isFinite(newRefY)) return;
    const dPrice = newRefY - ref.v;
    if (!Number.isFinite(dPrice)) return;

    // For time, use xScale.invert if available
    let dTime = 0;
    if (xs.invert) {
      const rawInvert = xs.invert(refX + dx);
      const rawValue = rawInvert instanceof Date ? rawInvert.getTime() : (rawInvert as number);
      if (!Number.isFinite(rawValue)) return;
      const newTime = indexToTime ? indexToTime(Math.round(rawValue)) : rawValue;
      if (!Number.isFinite(newTime)) return;
      dTime = newTime - ref.t;
    }

    const newPoints = original.map((p) => ({
      t: p.t + dTime,
      v: p.v + dPrice,
    }));

    onMove?.(annotation.id, { points: newPoints });
  }, [annotation.id, onMove, timeToIndex, indexToTime, compressedTimes]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  if (!pathData) return null;

  const selectionGlow = selected
    ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)')
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  return (
    <g
      className="brush-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <path
          d={pathData}
          fill="none"
          stroke={selectionGlow}
          strokeWidth={annotation.lineWidth + 6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Hit area — wider invisible stroke for easy clicking */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(HIT_AREA_WIDTH, annotation.lineWidth + 8)}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ cursor: 'pointer' }}
      />

      {/* Main path */}
      <path
        d={pathData}
        fill="none"
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Drag handle when selected (at bounding box center) */}
      {selected && bounds && (
        <g
          onMouseDown={handleMouseDown}
          style={{ cursor: 'grab' }}
        >
          <rect
            x={(bounds.minX + bounds.maxX) / 2 - DRAG_HANDLE_SIZE / 2}
            y={bounds.minY - DRAG_HANDLE_SIZE - 4}
            width={DRAG_HANDLE_SIZE}
            height={DRAG_HANDLE_SIZE}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={annotation.color}
            strokeWidth={2}
          />
          {/* Move icon (4-way arrows) */}
          <text
            x={(bounds.minX + bounds.maxX) / 2}
            y={bounds.minY - DRAG_HANDLE_SIZE / 2 - 4}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fill={annotation.color}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ✥
          </text>
        </g>
      )}
    </g>
  );
};

export default BrushAnnotationView;
