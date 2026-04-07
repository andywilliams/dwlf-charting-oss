import React, { useCallback } from 'react';
import type { EmojiAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import usePointAnnotationDrag from './usePointAnnotationDrag';
import { HANDLE_RADIUS } from './annotationConstants';

export interface EmojiAnnotationViewProps {
  annotation: EmojiAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, newTime: number, newPrice: number) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points (required for closest index search when compressGaps enabled) */
  dataLength?: number;
  /** Precomputed array of raw timestamps for each compressed index */
  compressedTimes?: number[];
}

const EmojiAnnotationView: React.FC<EmojiAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
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
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  }, [annotation.id, onSelect]);

  const { handleMouseDown, indexValue, isDragging } = usePointAnnotationDrag({
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

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (y < -50 || y > paneHeight + 50) return null;

  const fontSize = annotation.size ?? 24;
  const hitSize = fontSize + 8;
  const selectionColor = darkMode ? 'rgba(99, 179, 237, 0.5)' : 'rgba(59, 130, 246, 0.5)';

  return (
    <g
      className="emoji-annotation"
      onClick={handleClick}
      onMouseDown={selected ? handleMouseDown : undefined}
      style={{ cursor: isDragging ? 'grabbing' : selected ? 'grab' : 'pointer' }}
    >
      {/* Selection ring */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={hitSize / 2 + 4}
          fill="none"
          stroke={selectionColor}
          strokeWidth={2.5}
          strokeDasharray="4 3"
        />
      )}

      {/* Invisible hit area for easier clicking */}
      <circle
        cx={x}
        cy={y}
        r={hitSize / 2}
        fill="transparent"
        style={{ cursor: 'pointer' }}
      />

      {/* Emoji */}
      <text
        x={x}
        y={y}
        dy="0.35em"
        textAnchor="middle"
        fontSize={fontSize}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {annotation.emoji}
      </text>

      {/* Move handle when selected */}
      {selected && (
        <circle
          cx={x}
          cy={y - hitSize / 2 - 8}
          r={HANDLE_RADIUS}
          fill={darkMode ? '#e2e8f0' : '#1f2937'}
          stroke={darkMode ? '#475569' : '#cbd5e1'}
          strokeWidth={1}
          style={{ cursor: 'move' }}
        />
      )}
    </g>
  );
};

export default EmojiAnnotationView;
