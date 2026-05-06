import React, { useCallback, useEffect, useRef } from 'react';
import type { HLineAnnotation, PaneComputedScale } from '../../charting/types';
import { LINE_STYLE_MAP } from './annotationUtils';
import useAnnotationDrag from './useAnnotationDrag';
import { DRAG_HANDLE_SIZE, HANDLE_EDGE_OFFSET } from './annotationConstants';
import { DragHandle, LineHitArea, SelectionGlow } from './primitives';

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

  return (
    <g
      className="hline-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      {selected && (
        <SelectionGlow
          x1={0}
          x2={chartWidth}
          y1={y}
          y2={y}
          lineWidth={annotation.lineWidth}
          darkMode={darkMode}
        />
      )}

      <LineHitArea x1={0} x2={chartWidth} y1={y} y2={y} />

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

      {selected && (
        <DragHandle
          cx={HANDLE_EDGE_OFFSET + DRAG_HANDLE_SIZE / 2}
          cy={y}
          axis="horizontal"
          accentColor={annotation.color}
          darkMode={darkMode}
          onMouseDown={handleMouseDown}
        />
      )}
    </g>
  );
};

export default HLineAnnotationView;
