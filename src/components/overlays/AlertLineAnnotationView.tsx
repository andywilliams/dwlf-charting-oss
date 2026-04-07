import React, { useCallback, useEffect, useRef } from 'react';
import type { AlertLineAnnotation, PaneComputedScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';
import { LINE_STYLE_MAP, HIT_AREA_WIDTH, DRAG_HANDLE_SIZE, HANDLE_EDGE_OFFSET, INDICATOR_LINE_START, INDICATOR_LINE_END } from './annotationConstants';

export interface AlertLineAnnotationViewProps {
  annotation: AlertLineAnnotation;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, newPrice: number) => void;
}

const BELL_PATH =
  'M8 1.5a.5.5 0 0 1 .5.5v.54A4.002 4.002 0 0 1 12 6.5c0 1.57.39 2.8.87 3.66.24.43.46.72.62.89.08.09.13.13.15.15H2.36c.02-.02.07-.06.15-.15.16-.17.38-.46.62-.89C3.61 9.3 4 8.07 4 6.5A4.002 4.002 0 0 1 7.5 2.54V2a.5.5 0 0 1 .5-.5ZM6.5 13a1.5 1.5 0 0 0 3 0h-3Z';

const AlertLineAnnotationView: React.FC<AlertLineAnnotationViewProps> = ({
  annotation,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selected = false,
  onSelect,
  onMove,
}) => {
  const dragStartY = useRef<number>(0);
  const dragStartPrice = useRef<number>(0);
  const yScaleRef = useRef(yScale);

  useEffect(() => {
    yScaleRef.current = yScale;
  }, [yScale]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(annotation.id);
    },
    [annotation.id, onSelect],
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      dragStartY.current = e.clientY;
      dragStartPrice.current = annotation.price;
    },
    [annotation.price],
  );

  const handleDragMove = useCallback(
    (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - dragStartY.current;
      const scale = yScaleRef.current;
      const newPrice = scale.invert(scale.scale(dragStartPrice.current) + deltaY);
      if (Number.isFinite(newPrice)) {
        onMove?.(annotation.id, newPrice);
      }
    },
    [annotation.id, onMove],
  );

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  const y = yScale.scale(annotation.price);

  if (!Number.isFinite(y) || y < -20 || y > paneHeight + 20) return null;

  const strokeDasharray = LINE_STYLE_MAP[annotation.lineStyle] ?? undefined;

  // Visual distinction: alert lines use a different label style with bell
  const triggered = annotation.triggered;
  const labelText = annotation.label ?? (annotation.showPrice ? annotation.price.toFixed(2) : '');
  const bellSize = 16;
  const labelWidth = Math.max(70, (labelText.length * 7) + 16 + bellSize + 8);

  const baseColor = triggered ? '#64748b' : annotation.color;
  const lineOpacity = triggered ? 0.5 : 1;

  const selectionGlow = selected
    ? darkMode
      ? 'rgba(99, 179, 237, 0.4)'
      : 'rgba(59, 130, 246, 0.4)'
    : 'transparent';
  const handleColor = darkMode ? '#e2e8f0' : '#1f2937';

  // Direction indicator (small arrow on the left side)
  const dirArrowPoints =
    annotation.direction === 'above'
      ? `${28},${y - 2} ${32},${y - 8} ${36},${y - 2}`
      : `${28},${y + 2} ${32},${y + 8} ${36},${y + 2}`;

  return (
    <g
      className="alert-line-annotation"
      onClick={handleClick}
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
        stroke={baseColor}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        opacity={lineOpacity}
      />

      {/* Direction arrow indicator */}
      {!triggered && (
        <polygon
          points={dirArrowPoints}
          fill={baseColor}
          opacity={0.8}
        />
      )}

      {/* Bell icon + label badge on right */}
      <g>
        <rect
          x={chartWidth - labelWidth - 8}
          y={y - 12}
          width={labelWidth}
          height={24}
          fill={triggered ? '#64748b' : baseColor}
          fillOpacity={0.9}
          rx={4}
        />
        {/* Bell icon */}
        <g
          transform={`translate(${chartWidth - labelWidth - 2}, ${y - 8}) scale(${triggered ? 0.85 : 1})`}
        >
          <path d={BELL_PATH} fill="white" opacity={triggered ? 0.5 : 1} />
          {/* Strikethrough for triggered */}
          {triggered && (
            <line
              x1={2}
              y1={14}
              x2={14}
              y2={2}
              stroke="white"
              strokeWidth={1.5}
              opacity={0.8}
            />
          )}
        </g>
        {labelText && (
          <text
            x={chartWidth - labelWidth / 2 + 4}
            y={y}
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
            opacity={triggered ? 0.6 : 1}
          >
            {labelText}
          </text>
        )}
      </g>

      {/* Drag handle (left side) */}
      {selected && (
        <g onMouseDown={handleMouseDown} style={{ cursor: 'ns-resize' }}>
          <rect
            x={HANDLE_EDGE_OFFSET}
            y={y - DRAG_HANDLE_SIZE / 2}
            width={DRAG_HANDLE_SIZE}
            height={DRAG_HANDLE_SIZE}
            fill={handleColor}
            fillOpacity={0.9}
            rx={3}
            stroke={baseColor}
            strokeWidth={2}
          />
          {/* Drag indicator lines - derived from constants for consistent centering */}
          <line
            x1={INDICATOR_LINE_START}
            x2={INDICATOR_LINE_END}
            y1={y - 2}
            y2={y - 2}
            stroke={baseColor}
            strokeWidth={1.5}
          />
          <line
            x1={INDICATOR_LINE_START}
            x2={INDICATOR_LINE_END}
            y1={y + 2}
            y2={y + 2}
            stroke={baseColor}
            strokeWidth={1.5}
          />
        </g>
      )}
    </g>
  );
};

export default AlertLineAnnotationView;
