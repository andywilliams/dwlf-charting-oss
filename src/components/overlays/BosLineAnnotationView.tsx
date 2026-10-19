import React, { useCallback, useEffect, useRef } from 'react';
import type { BosLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import { LINE_STYLE_MAP, findClosestIndex } from './annotationUtils';
import { intersects, type PixelRect } from './zoneRects';
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
  /** The zone boxes drawn on the pane, in pixels: an `auto` label is placed clear of them. */
  avoidRects?: PixelRect[];
}

type Placement = Exclude<NonNullable<BosLineAnnotation['labelPlacement']>, 'auto'>;
/**
 * A segment tries its break end first, then its swing end, then beside either end; a full-width line
 * only its left end (its right end is the price badge's).
 */
const AUTO_ORDER: Record<'segment' | 'line', readonly Placement[]> = {
  segment: ['end-above', 'end-below', 'start-above', 'start-below', 'start-beside', 'end-beside'],
  line: ['start-above', 'start-below', 'start-beside'],
};
/** The label's box around its anchor: 10px bold text, about 6.5px a character, plus a little air. */
const LABEL_HEIGHT = 12;
/** Beside an end the text is centred on the line, so its box is the 10px em box, no baseline air. */
const BESIDE_HEIGHT = 10;
const labelWidth = (text: string) => text.length * 6.5 + 4;

/** The label box for a placement, in pixels, as the <text> below draws it. */
export function labelBox(placement: Placement, text: string, y: number, startX: number, endX: number): PixelRect {
  const w = labelWidth(text);
  const atEnd = placement.startsWith('end');
  if (placement.endsWith('beside')) {
    const left = atEnd ? endX + 6 : startX - 6 - w;
    return { left, right: left + w, top: y - BESIDE_HEIGHT / 2, bottom: y + BESIDE_HEIGHT / 2 };
  }
  const left = atEnd ? endX - 4 - w : startX + 4;
  const top = placement.endsWith('below') ? y + 3 : y - 3 - LABEL_HEIGHT;
  return { left, right: left + w, top, bottom: top + LABEL_HEIGHT };
}

/**
 * The first placement whose label box lies inside the pane and is clear of every zone; else the
 * first inside the pane; else the line's default (end-above for a segment, start-above for a full-width line).
 */
export function autoPlacement(
  text: string,
  y: number,
  startX: number,
  endX: number,
  avoid: readonly PixelRect[],
  pane: { width: number; height: number },
  segment: boolean,
  priceBadge = false,
): Placement {
  const order = AUTO_ORDER[segment ? 'segment' : 'line'].filter((p) => !(priceBadge && p === 'end-beside'));
  const fits = (p: Placement) => {
    const b = labelBox(p, text, y, startX, endX);
    return b.left >= 0 && b.right <= pane.width && b.top >= 0 && b.bottom <= pane.height;
  };
  const clear = (p: Placement) => !avoid.some((r) => intersects(labelBox(p, text, y, startX, endX), r));
  // Clear and on the pane; else at least on the pane (over a zone, the halo keeps it readable); else the default.
  return order.find((p) => fits(p) && clear(p)) ?? order.find(fits) ?? order[0];
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
  avoidRects = [],
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
  
  const typeLabelText = annotation.label ?? (annotation.bosType === 'ChoCH' ? 'ChoCH' : 'BOS');
  const priceLabelText = annotation.price.toFixed(2);

  const priceLabelWidth = Math.max(50, priceLabelText.length * 7 + 16);

  // Resolve a raw timestamp to a pixel x (respecting compressGaps mode).
  const resolveX = (t: number): number | null => {
    const xv = findClosestIndex(t, compressedTimes, timeToIndex);
    const px = xv !== undefined ? xScale(xv) : xScale(t);
    return Number.isFinite(px) ? px : null;
  };

  // When a startTime is supplied the line is a bounded segment (the broken
  // swing → the break candle, the SMC convention); otherwise it falls back to
  // the legacy full-width level line extending to the right edge of the chart.
  const breakX = resolveX(annotation.time) ?? 0;
  const startXOpt = annotation.startTime != null ? resolveX(annotation.startTime) : null;
  const hasSegment = startXOpt !== null;
  const lineStartX = hasSegment ? (startXOpt as number) : breakX;
  const lineEndX = hasSegment ? breakX : chartWidth;

  const asked = annotation.labelPlacement ?? (hasSegment ? 'end-above' : 'start-above');
  const placement = asked === 'auto'
    ? autoPlacement(typeLabelText, y, lineStartX, lineEndX, avoidRects, { width: chartWidth, height: paneHeight }, hasSegment, annotation.showPrice)
    : asked;
  const labelAtEnd = placement.startsWith('end');
  const labelBelow = placement.endsWith('below');
  const labelBeside = placement.endsWith('beside');

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
          x2={lineEndX}
          y1={y}
          y2={y}
          lineWidth={annotation.lineWidth}
          darkMode={darkMode}
        />
      )}

      <LineHitArea x1={lineStartX} x2={lineEndX} y1={y} y2={y} />

      {/* Main line */}
      <line
        x1={lineStartX}
        x2={lineEndX}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={annotation.lineWidth}
        strokeDasharray={lineStyle}
        strokeLinecap="round"
        opacity={lineOpacity}
      />

      {/* Type label (BOS/ChoCH) — subtle line-coloured text beside the line, at the
          placement asked for (default: above it, at the break end of a segment). */}
      {annotation.showLabel && (
        <text
          x={labelBeside ? (labelAtEnd ? lineEndX + 6 : lineStartX - 6) : labelAtEnd ? lineEndX - 4 : lineStartX + 4}
          y={labelBeside ? y : labelBelow ? y + 5 : y - 5}
          dominantBaseline={labelBeside ? 'central' : labelBelow ? 'hanging' : undefined}
          // Inside an end, the label reads inward along the line; beside one, outward from it.
          textAnchor={labelAtEnd !== labelBeside ? 'end' : 'start'}
          fontSize={10}
          fill={color}
          fontWeight={600}
          // With a halo, only the text dims on a pending break: the halo stays whole, or what is behind shows through it.
          {...(annotation.labelHalo
            ? { fillOpacity: lineOpacity, stroke: annotation.labelHalo, strokeWidth: 3, strokeLinejoin: 'round' as const, paintOrder: 'stroke' }
            : { opacity: lineOpacity })}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {typeLabelText}
        </text>
      )}

      {/* Price label badge — sits at the segment end when bounded, else the
          chart's right edge (legacy full-width line). */}
      {annotation.showPrice && (
        <g>
          <rect
            x={hasSegment ? breakX + 6 : chartWidth - priceLabelWidth - 8}
            y={y - 10}
            width={priceLabelWidth}
            height={20}
            fill={color}
            fillOpacity={0.9}
            rx={4}
          />
          <text
            x={hasSegment ? breakX + 6 + priceLabelWidth / 2 : chartWidth - priceLabelWidth / 2 - 8}
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