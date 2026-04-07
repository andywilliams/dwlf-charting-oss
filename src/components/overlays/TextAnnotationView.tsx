import React, { useCallback } from 'react';
import type { TextAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { findClosestIndex, resolveX } from './annotationUtils';
import { HANDLE_RADIUS } from './annotationConstants';

export interface TextAnnotationViewProps {
  annotation: TextAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onDoubleClick?: (id: string) => void;
  onMove?: (id: string, newTime: number, newPrice: number) => void;
  onTextEdit?: (id: string) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points (required for closest index search when compressGaps enabled) */
  dataLength?: number;
  /** Precomputed array of raw timestamps for each compressed index */
  compressedTimes?: number[];
}

const TextAnnotationView: React.FC<TextAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onDoubleClick,
  onMove,
  onTextEdit,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes,
}) => {
  // All hooks must be called before any conditional returns (Rules of Hooks)
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(annotation.id);
    onTextEdit?.(annotation.id);
  }, [annotation.id, onDoubleClick, onTextEdit]);

  const { handleMouseDown, indexValue, isDragging } = useAnnotationDrag({
    annotationId: annotation.id,
    time: annotation.time,
    price: annotation.price,
    xScale,
    yScale,
    onMove,
    timeToIndex,
    indexToTime,
    dataLength,
    compressedTimes,
  });
  
  // If using compressed time and no valid index found, don't render
  if (timeToIndex && indexValue === undefined) {
    return null;
  }
  
  const xValue = indexValue ?? annotation.time;
  const x = xScale(xValue);
  const y = yScale.scale(annotation.price);

  // Check if position is valid
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // Don't render if outside visible area with some margin
  if (y < -50 || y > paneHeight + 50) return null;

  const padding = 6;
  const lines = annotation.text.split('\n');
  const lineHeight = annotation.fontSize * 1.3;
  const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
  const textWidth = Math.max(20, longestLine.length * (annotation.fontSize * 0.6) + padding * 2);
  const textHeight =
    lines.length === 1
      ? annotation.fontSize + padding * 2
      : (lines.length * lineHeight) + padding * 2;

  const selectionGlow = selected ? (darkMode ? 'rgba(99, 179, 237, 0.5)' : 'rgba(59, 130, 246, 0.5)') : 'transparent';
  const bgColor = annotation.backgroundColor || (darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)');
  const borderColor = selected ? (darkMode ? '#63b3ed' : '#3b82f6') : (darkMode ? '#475569' : '#cbd5e1');

  return (
    <g 
      className="text-annotation"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={selected ? handleMouseDown : undefined}
      style={{ cursor: isDragging ? 'grabbing' : selected ? 'grab' : 'pointer' }}
    >
      {/* Selection glow */}
      {selected && (
        <rect
          x={x - textWidth / 2 - 3}
          y={y - textHeight / 2 - 3}
          width={textWidth + 6}
          height={textHeight + 6}
          fill="none"
          stroke={selectionGlow}
          strokeWidth={3}
          rx={6}
        />
      )}

      {/* Background */}
      <rect
        x={x - textWidth / 2}
        y={y - textHeight / 2}
        width={textWidth}
        height={textHeight}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={1}
        rx={4}
      />

      {/* Text */}
      <text
        x={x}
        y={y - (lines.length - 1) * lineHeight / 2}
        dy="0.35em"
        textAnchor="middle"
        fontSize={annotation.fontSize}
        fill={annotation.color}
        fontWeight={500}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>

      {/* Move handle indicator when selected */}
      {selected && (
        <circle
          cx={x}
          cy={y - textHeight / 2 - 8}
          r={HANDLE_RADIUS}
          fill={darkMode ? '#e2e8f0' : '#1f2937'}
          stroke={borderColor}
          strokeWidth={1}
          style={{ cursor: 'move' }}
        />
      )}
    </g>
  );
};

export default TextAnnotationView;
