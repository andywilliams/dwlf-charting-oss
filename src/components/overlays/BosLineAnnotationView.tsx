import React, { useCallback, useEffect, useRef } from 'react';
import type { BosLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { LINE_STYLE_MAP, findClosestIndex } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { HIT_AREA_WIDTH, DRAG_HANDLE_SIZE, HANDLE_EDGE_OFFSET, INDICATOR_LINE_START, INDICATOR_LINE_END } from './annotationConstants';

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

  const selectionGlow = selected ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)') : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

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
      {/* Selection glow */}
      {selected && (
        <line
          x1={lineStartX}
          x2={chartWidth}
          y1={y}
          y2={y}
          stroke={selectionGlow}
          strokeWidth={annotation.lineWidth + 6}
          strokeLinecap="round"
        />
      )}

      {/* Hit area (invisible, wider for easier clicking) */}
      <line
        x1={lineStartX}
        x2={chartWidth}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
      />

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

      {/* Drag handle (left side, near the time marker) */}
      {selected && (
        <g 
          onMouseDown={handleMouseDown}
          style={{ cursor: 'ns-resize' }}
        >
          <rect
            x={lineStartX + HANDLE_EDGE_OFFSET}
            y={y - DRAG_HANDLE_SIZE / 2}
            width={DRAG_HANDLE_SIZE}
            height={DRAG_HANDLE_SIZE}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={color}
            strokeWidth={2}
          />
          {/* Drag indicator lines */}
          <line x1={lineStartX + INDICATOR_LINE_START} x2={lineStartX + INDICATOR_LINE_END} y1={y - 2} y2={y - 2} stroke={color} strokeWidth={1.5} />
          <line x1={lineStartX + INDICATOR_LINE_START} x2={lineStartX + INDICATOR_LINE_END} y1={y + 2} y2={y + 2} stroke={color} strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
};

export default BosLineAnnotationView;