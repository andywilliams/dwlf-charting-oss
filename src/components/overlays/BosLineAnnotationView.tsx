import React, { useCallback, useEffect, useRef } from 'react';
import type { BosLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { LINE_STYLE_MAP, findClosestIndex } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { DRAG_HANDLE_SIZE, HANDLE_EDGE_OFFSET } from './annotationConstants';
import { DragHandle, LineHitArea, SelectionGlow } from './primitives';

export interface BosLineAnnotationViewProps {
  annotation: BosLineAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onDoubleClick?: (id: string) => void;
  onMove?: (id: string, newPrice: number) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

/** Default colors based on direction */
const DIRECTION_COLORS = {
  bullish: '#22c55e',
  bearish: '#ef4444',
};

/** Get color based on direction or use provided color */
const getColor = (annotation: BosLineAnnotation): string => {
  return annotation.color || DIRECTION_COLORS[annotation.direction];
};

/** Get line style based on BOS type */
const getLineStyle = (annotation: BosLineAnnotation): string | undefined => {
  if (annotation.bosType === 'ChoCH') return LINE_STYLE_MAP.dashed;
  return LINE_STYLE_MAP[annotation.lineStyle];
};

const BosLineAnnotationView: React.FC<BosLineAnnotationViewProps> = ({
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
  dataLength = 0,
  compressedTimes,
}) => {
  const dragStartY = useRef<number>(0);
  const dragStartPrice = useRef<number>(0);
  const yScaleRef = useRef(yScale);

  useEffect(() => {
    yScaleRef.current = yScale;
  }, [yScale]);

  // All hooks must be called before any conditional returns (Rules of Hooks)
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(annotation.id);
  }, [annotation.id, onDoubleClick]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartY.current = e.clientY;
    dragStartPrice.current = annotation.price;
  }, [annotation.price]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaY = moveEvent.clientY - dragStartY.current;
    const scale = yScaleRef.current;
    const newPrice = scale.invert(scale.scale(dragStartPrice.current) + deltaY);
    if (Number.isFinite(newPrice)) {
      onMove?.(annotation.id, newPrice);
    }
  }, [annotation.id, onMove]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  const y = yScale.scale(annotation.price);

  // Don't render if y is not a valid finite number or outside visible area
  if (!Number.isFinite(y) || y < -20 || y > paneHeight + 20) return null;

  const color = getColor(annotation);
  const strokeDasharray = getLineStyle(annotation);
  
  const typeLabelText = annotation.bosType === 'ChoCH' ? 'ChoCH' : 'BOS';
  const priceLabelText = annotation.price.toFixed(2);
  
  const typeLabelWidth = Math.max(50, typeLabelText.length * 7 + 16);
  const priceLabelWidth = Math.max(50, priceLabelText.length * 7 + 16);

  // Calculate start position based on annotation time (for partial-width lines)
  // Use findClosestIndex with compressedTimes fallback for compressGaps mode
  const xValue = findClosestIndex(annotation.time, compressedTimes, timeToIndex);
  const startX = xValue !== undefined ? xScale(xValue) : xScale(annotation.time);
  const lineStartX = Number.isFinite(startX) ? startX : 0;

  // For unconfirmed BOS, use dashed style to indicate pending
  const lineStyle = annotation.confirmed ? strokeDasharray : LINE_STYLE_MAP.dashed;
  // For unconfirmed, reduce opacity
  const lineOpacity = annotation.confirmed ? 1 : 0.5;

  return (
    <g 
      className="bos-line-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {selected && (
        <SelectionGlow
          x1={lineStartX}
          x2={chartWidth}
          y1={y}
          y2={y}
          lineWidth={annotation.lineWidth}
          darkMode={darkMode}
        />
      )}

      <LineHitArea x1={lineStartX} x2={chartWidth} y1={y} y2={y} />

      {/* Main line */}
      <line
        x1={lineStartX}
        x2={chartWidth}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={lineStyle}
        strokeLinecap="round"
        opacity={lineOpacity}
      />

      {/* Type label badge (BOS/ChoCH) on left side */}
      {annotation.showLabel && (
        <g>
          <rect
            x={lineStartX + 4}
            y={y - 10}
            width={typeLabelWidth}
            height={20}
            fill={color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={lineStartX + 4 + typeLabelWidth / 2}
            y={y}
            dy="0.35em"
            textAnchor="middle"
            fontSize={10}
            fill="white"
            fontWeight={600}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {typeLabelText}
          </text>
        </g>
      )}

      {/* Price label badge on right */}
      {annotation.showPrice && (
        <g>
          <rect
            x={chartWidth - priceLabelWidth - 8}
            y={y - 10}
            width={priceLabelWidth}
            height={20}
            fill={color}
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
            {priceLabelText}
          </text>
        </g>
      )}

      {selected && (
        <DragHandle
          cx={lineStartX + HANDLE_EDGE_OFFSET + DRAG_HANDLE_SIZE / 2}
          cy={y}
          axis="horizontal"
          accentColor={color}
          darkMode={darkMode}
          onMouseDown={handleMouseDown}
        />
      )}
    </g>
  );
};

export default BosLineAnnotationView;