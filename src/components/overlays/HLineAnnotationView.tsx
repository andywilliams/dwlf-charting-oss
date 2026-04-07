import React, { useCallback, useEffect, useRef } from 'react';
import type { HLineAnnotation, PaneComputedScale } from '../../charting/types';
import { LINE_STYLE_MAP } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { HIT_AREA_WIDTH, DRAG_HANDLE_SIZE, HANDLE_EDGE_OFFSET, INDICATOR_LINE_START, INDICATOR_LINE_END } from './annotationConstants';

export interface HLineAnnotationViewProps {
  annotation: HLineAnnotation;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onDoubleClick?: (id: string) => void;
  onMove?: (id: string, newPrice: number) => void;
}

const HLineAnnotationView: React.FC<HLineAnnotationViewProps> = ({
  annotation,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onDoubleClick,
  onMove,
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

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] || undefined;
  const labelText = annotation.label || (annotation.showPrice ? annotation.price.toFixed(2) : '');
  const labelWidth = Math.max(50, labelText.length * 7 + 16);

  const selectionGlow = selected ? (darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)') : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  return (
    <g 
      className="hline-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <line
          x1={0}
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
        x1={0}
        x2={chartWidth}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={HIT_AREA_WIDTH}
        style={{ cursor: 'pointer' }}
      />

      {/* Main line */}
      <line
        x1={0}
        x2={chartWidth}
        y1={y}
        y2={y}
        stroke={annotation.color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />

      {/* Label badge on right */}
      {labelText && (
        <g>
          <rect
            x={chartWidth - labelWidth - 8}
            y={y - 10}
            width={labelWidth}
            height={20}
            fill={annotation.color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={chartWidth - labelWidth / 2 - 8}
            y={y}
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {labelText}
          </text>
        </g>
      )}

      {/* Drag handle (left side) */}
      {selected && (
        <g 
          onMouseDown={handleMouseDown}
          style={{ cursor: 'ns-resize' }}
        >
          <rect
            x={HANDLE_EDGE_OFFSET}
            y={y - DRAG_HANDLE_SIZE / 2}
            width={DRAG_HANDLE_SIZE}
            height={DRAG_HANDLE_SIZE}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={annotation.color}
            strokeWidth={2}
          />
          {/* Drag indicator lines - derived from constants for consistent centering */}
          <line x1={INDICATOR_LINE_START} x2={INDICATOR_LINE_END} y1={y - 2} y2={y - 2} stroke={annotation.color} strokeWidth={1.5} />
          <line x1={INDICATOR_LINE_START} x2={INDICATOR_LINE_END} y1={y + 2} y2={y + 2} stroke={annotation.color} strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
};

export default HLineAnnotationView;
