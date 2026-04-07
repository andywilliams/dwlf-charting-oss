import React, { useCallback, useMemo } from 'react';
import type { 
  Annotation, 
  HLineAnnotation, 
  VLineAnnotation,
  TextAnnotation, 
  TrendLineAnnotation,
  RayAnnotation,
  CrossLineAnnotation,
  RectangleAnnotation,
  EmojiAnnotation,
  TimeRangeAnnotation,
  ArrowAnnotation,
  ChannelAnnotation,
  FibRetracementAnnotation,
  MeasureAnnotation,
  AlertLineAnnotation,
  BrushAnnotation,
  PitchforkAnnotation,
  FibExtensionAnnotation,
  OrderBlockAnnotation,
  FairValueGapAnnotation,
  BosLineAnnotation,
  PaneComputedScale,
  XScale,
} from '../../charting/types';
import HLineAnnotationView from './HLineAnnotationView';
import VLineAnnotationView from './VLineAnnotationView';
import TextAnnotationView from './TextAnnotationView';
import TrendLineAnnotationView from './TrendLineAnnotationView';
import RayAnnotationView from './RayAnnotationView';
import CrossLineAnnotationView from './CrossLineAnnotationView';
import RectangleAnnotationView from './RectangleAnnotationView';
import EmojiAnnotationView from './EmojiAnnotationView';
import TimeRangeAnnotationView from './TimeRangeAnnotationView';
import ArrowAnnotationView from './ArrowAnnotationView';
import ChannelAnnotationView from './ChannelAnnotationView';
import FibRetracementAnnotationView from './FibRetracementAnnotationView';
import MeasureAnnotationView from './MeasureAnnotationView';
import AlertLineAnnotationView from './AlertLineAnnotationView';
import BrushAnnotationView from './BrushAnnotationView';
import PitchforkAnnotationView from './PitchforkAnnotationView';
import FibExtensionAnnotationView from './FibExtensionAnnotationView';
import OrderBlockAnnotationView from './OrderBlockAnnotationView';
import FairValueGapAnnotationView from './FairValueGapAnnotationView';
import BosLineAnnotationView from './BosLineAnnotationView';

export interface AnnotationLayerProps {
  annotations: Annotation[];
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selectedAnnotationId?: string | null;
  onAnnotationSelect?: (id: string | null) => void;
  onAnnotationDoubleClick?: (id: string) => void;
  onAnnotationMove?: (id: string, update: Partial<Annotation>) => void;
  onAnnotationTextEdit?: (id: string) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points (required for closest index search when compressGaps enabled) */
  dataLength?: number;
  /** Pre-computed compressed times array (avoids redundant reconstruction from indexToTime) */
  compressedTimes?: number[];
  /** Optional time formatter for vertical line labels */
  timeFormatter?: (t: number) => string;
  /** Current chart timeframe — used to filter annotations by visibleTimeframes */
  currentTimeframe?: string;
  /** Animation phase for controlling fade-in transitions */
  animationPhase?: string;
}

const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  annotations,
  xScale,
  yScale,
  chartWidth,
  paneHeight,
  darkMode = false,
  selectedAnnotationId = null,
  onAnnotationSelect,
  onAnnotationDoubleClick,
  onAnnotationMove,
  onAnnotationTextEdit,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes: compressedTimesProp,
  timeFormatter,
  currentTimeframe,
  animationPhase,
}) => {
  // Filter annotations by timeframe visibility
  const visibleAnnotations = useMemo(() => {
    if (!currentTimeframe) return annotations;
    return annotations.filter(a =>
      !a.visibleTimeframes || a.visibleTimeframes.length === 0 || a.visibleTimeframes.includes(currentTimeframe)
    );
  }, [annotations, currentTimeframe]);
  const handleHLineMove = useCallback((id: string, newPrice: number) => {
    onAnnotationMove?.(id, { price: newPrice });
  }, [onAnnotationMove]);

  const handleVLineMove = useCallback((id: string, newTime: number) => {
    onAnnotationMove?.(id, { time: newTime });
  }, [onAnnotationMove]);

  /** Shared move handler for annotations with time+price (text, crossline, emoji) */
  const handleTimedAnnotationMove = useCallback((id: string, newTime: number, newPrice: number) => {
    onAnnotationMove?.(id, { time: newTime, price: newPrice });
  }, [onAnnotationMove]);

  const handleTrendLineMove = useCallback((id: string, update: Partial<TrendLineAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleRayMove = useCallback((id: string, update: Partial<RayAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleRectangleMove = useCallback((id: string, update: Partial<RectangleAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleTimeRangeMove = useCallback((id: string, update: Partial<TimeRangeAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleArrowMove = useCallback((id: string, update: Partial<ArrowAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleChannelMove = useCallback((id: string, update: Partial<ChannelAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleFibMove = useCallback((id: string, update: Partial<FibRetracementAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleMeasureMove = useCallback((id: string, update: Partial<MeasureAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handlePitchforkMove = useCallback((id: string, update: Partial<PitchforkAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleFibExtensionMove = useCallback((id: string, update: Partial<FibExtensionAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleOrderBlockMove = useCallback((id: string, update: Partial<OrderBlockAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleFairValueGapMove = useCallback((id: string, update: Partial<FairValueGapAnnotation>) => {
    onAnnotationMove?.(id, update);
  }, [onAnnotationMove]);

  const handleBosLineMove = useCallback((id: string, newPrice: number) => {
    onAnnotationMove?.(id, { price: newPrice });
  }, [onAnnotationMove]);

  // Sort annotations:
  // 1. Brush strokes render first (lowest z-order)
  // 2. TimeRange and Rectangles render next (as background zones/bands)
  // 3. Arrow annotations render next (background connectors)
  // 4. Text/emoji annotations render next
  // 5. Lines (crossline, vline, trendline, ray) on top
  // 6. HLine on top of everything
  // 7. Selected annotation always renders last (topmost)
  const sortedAnnotations = useMemo(() => (
    [...visibleAnnotations].sort((a, b) => {
      // Selected annotation always on top
      if (a.id === selectedAnnotationId) return 1;
      if (b.id === selectedAnnotationId) return -1;
      const typeOrder: Record<string, number> = { 
        brush: -1, 
        timerange: 0, 
        rectangle: 0, 
        channel: 0, 
        pitchfork: 0, 
        fib_extension: 0, 
        order_block: 0, 
        fair_value_gap: 0, 
        arrow: 1, 
        text: 2, 
        emoji: 2, 
        fibRetracement: 3, 
        crossline: 3, 
        vline: 3, 
        trendline: 4, 
        ray: 4, 
        hline: 5, 
        bos_line: 5, 
        measure: 6, 
        alert_line: 5 
      };
      const aOrder = typeOrder[a.type] ?? 2;
      const bOrder = typeOrder[b.type] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return 0;
    })
  ), [visibleAnnotations, selectedAnnotationId]);

  const compressedTimes = useMemo(() => {
    // Use pre-computed array from parent when available to avoid redundant reconstruction
    if (compressedTimesProp && compressedTimesProp.length > 0) return compressedTimesProp;
    if (!indexToTime || dataLength <= 0) return undefined;
    const times = new Array<number>(dataLength);
    for (let i = 0; i < dataLength; i += 1) {
      times[i] = indexToTime(i);
    }
    return times;
  }, [compressedTimesProp, indexToTime, dataLength]);

  // Keep annotations visible when animation is not in use.
  const isAnimationEnabled = animationPhase !== undefined;
  const isVisiblePhase = animationPhase === 'annotations' || animationPhase === 'complete';
  const layerOpacity = isAnimationEnabled ? (isVisiblePhase ? 1 : 0) : 1;
  const layerStyle = {
    opacity: layerOpacity,
    pointerEvents: layerOpacity === 0 ? 'none' : 'auto',
    transition: animationPhase === 'annotations' ? 'opacity 400ms ease-in-out' : 'none',
  };

  return (
    <g className="annotation-layer" style={layerStyle}>
      {/* Render all annotations in sorted order so selected is always on top */}
      {sortedAnnotations.map(annotation => {
        if (annotation.type === 'hline') {
          return (
            <HLineAnnotationView
              key={annotation.id}
              annotation={annotation}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onDoubleClick={onAnnotationDoubleClick}
              onMove={handleHLineMove}
            />
          );
        }
        if (annotation.type === 'vline') {
          return (
            <VLineAnnotationView
              key={annotation.id}
              annotation={annotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onDoubleClick={onAnnotationDoubleClick}
              onMove={handleVLineMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
              timeFormatter={timeFormatter}
            />
          );
        }
        if (annotation.type === 'fib_extension') {
          return (
            <FibExtensionAnnotationView
              key={annotation.id}
              annotation={annotation as FibExtensionAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleFibExtensionMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'order_block') {
          return (
            <OrderBlockAnnotationView
              key={annotation.id}
              annotation={annotation as OrderBlockAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleOrderBlockMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'fair_value_gap') {
          return (
            <FairValueGapAnnotationView
              key={annotation.id}
              annotation={annotation as FairValueGapAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleFairValueGapMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'bos_line') {
          return (
            <BosLineAnnotationView
              key={annotation.id}
              annotation={annotation as BosLineAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onDoubleClick={onAnnotationDoubleClick}
              onMove={handleBosLineMove}
              timeToIndex={timeToIndex}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'brush') {
          return (
            <BrushAnnotationView
              key={annotation.id}
              annotation={annotation as BrushAnnotation}
              xScale={xScale}
              yScale={yScale}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onDoubleClick={onAnnotationDoubleClick}
              onMove={onAnnotationMove as any}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'alert_line') {
          return (
            <AlertLineAnnotationView
              key={annotation.id}
              annotation={annotation as AlertLineAnnotation}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleHLineMove}
            />
          );
        }
        if (annotation.type === 'trendline') {
          return (
            <TrendLineAnnotationView
              key={annotation.id}
              annotation={annotation as TrendLineAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onDoubleClick={onAnnotationDoubleClick}
              onMove={handleTrendLineMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'ray') {
          return (
            <RayAnnotationView
              key={annotation.id}
              annotation={annotation as RayAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleRayMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'crossline') {
          return (
            <CrossLineAnnotationView
              key={annotation.id}
              annotation={annotation as CrossLineAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleTimedAnnotationMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
              timeFormatter={timeFormatter}
            />
          );
        }
        if (annotation.type === 'rectangle') {
          return (
            <RectangleAnnotationView
              key={annotation.id}
              annotation={annotation as RectangleAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleRectangleMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'emoji') {
          return (
            <EmojiAnnotationView
              key={annotation.id}
              annotation={annotation as EmojiAnnotation}
              xScale={xScale}
              yScale={yScale}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleTimedAnnotationMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'timerange') {
          return (
            <TimeRangeAnnotationView
              key={annotation.id}
              annotation={annotation as TimeRangeAnnotation}
              xScale={xScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleTimeRangeMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
              timeFormatter={timeFormatter}
            />
          );
        }
        if (annotation.type === 'arrow') {
          return (
            <ArrowAnnotationView
              key={annotation.id}
              annotation={annotation as ArrowAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleArrowMove}
              onDoubleClick={onAnnotationDoubleClick}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'channel') {
          return (
            <ChannelAnnotationView
              key={annotation.id}
              annotation={annotation as ChannelAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleChannelMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'fibRetracement') {
          return (
            <FibRetracementAnnotationView
              key={annotation.id}
              annotation={annotation as FibRetracementAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleFibMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'measure') {
          return (
            <MeasureAnnotationView
              key={annotation.id}
              annotation={annotation as MeasureAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handleMeasureMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type === 'pitchfork') {
          return (
            <PitchforkAnnotationView
              key={annotation.id}
              annotation={annotation as PitchforkAnnotation}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              paneHeight={paneHeight}
              darkMode={darkMode}
              selected={annotation.id === selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onMove={handlePitchforkMove}
              timeToIndex={timeToIndex}
              indexToTime={indexToTime}
              dataLength={dataLength}
              compressedTimes={compressedTimes}
            />
          );
        }
        if (annotation.type !== 'text') {
          return null; // Unknown annotation type
        }
        return (
          <TextAnnotationView
            key={annotation.id}
            annotation={annotation}
            xScale={xScale}
            yScale={yScale}
            paneHeight={paneHeight}
            darkMode={darkMode}
            selected={annotation.id === selectedAnnotationId}
            onSelect={onAnnotationSelect}
            onDoubleClick={onAnnotationDoubleClick}
            onMove={handleTimedAnnotationMove}
            onTextEdit={onAnnotationTextEdit}
            timeToIndex={timeToIndex}
            indexToTime={indexToTime}
            dataLength={dataLength}
            compressedTimes={compressedTimes}
          />
        );
      })}
    </g>
  );
};

export default AnnotationLayer;

// Also export utility functions for annotation management
export const createHLineAnnotation = (
  symbol: string,
  timeframe: string,
  price: number,
  options: Partial<Omit<HLineAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'price' | 'createdAt' | 'updatedAt'>> = {}
): HLineAnnotation => {
  const now = Date.now();
  return {
    id: `hline-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'hline',
    symbol,
    timeframe,
    price,
    color: options.color ?? '#ef4444',
    lineStyle: options.lineStyle ?? 'dashed',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    showPrice: options.showPrice ?? true,
    visibleTimeframes: options.visibleTimeframes,
    createdAt: now,
    updatedAt: now,
  };
};

export const createVLineAnnotation = (
  symbol: string,
  timeframe: string,
  time: number,
  options: Partial<Omit<VLineAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time' | 'createdAt' | 'updatedAt'>> = {}
): VLineAnnotation => {
  const now = Date.now();
  return {
    id: `vline-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'vline',
    symbol,
    timeframe,
    time,
    color: options.color ?? '#3b82f6',
    lineStyle: options.lineStyle ?? 'dashed',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    showTime: options.showTime ?? true,
    visibleTimeframes: options.visibleTimeframes,
    createdAt: now,
    updatedAt: now,
  };
};

export const createTextAnnotation = (
  symbol: string,
  timeframe: string,
  time: number,
  price: number,
  text: string,
  options: Partial<Omit<TextAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time' | 'price' | 'text' | 'createdAt' | 'updatedAt'>> = {}
): TextAnnotation => {
  const now = Date.now();
  return {
    id: `text-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'text',
    symbol,
    timeframe,
    time,
    price,
    text,
    color: options.color ?? '#1f2937',
    backgroundColor: options.backgroundColor,
    fontSize: options.fontSize ?? 12,
    visibleTimeframes: options.visibleTimeframes,
    createdAt: now,
    updatedAt: now,
  };
};

export const createTrendLineAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  options: Partial<Omit<TrendLineAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'createdAt' | 'updatedAt'>> = {}
): TrendLineAnnotation => {
  const now = Date.now();
  return {
    id: `trendline-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'trendline',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    color: options.color ?? '#3b82f6',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    extendLeft: options.extendLeft ?? false,
    extendRight: options.extendRight ?? false,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createRayAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  options: Partial<Omit<RayAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'createdAt' | 'updatedAt'>> = {}
): RayAnnotation => {
  const now = Date.now();
  return {
    id: `ray-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'ray',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    color: options.color ?? '#f97316',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createCrossLineAnnotation = (
  symbol: string,
  timeframe: string,
  time: number,
  price: number,
  options: Partial<Omit<CrossLineAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time' | 'price' | 'createdAt' | 'updatedAt'>> = {}
): CrossLineAnnotation => {
  const now = Date.now();
  return {
    id: `crossline-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'crossline',
    symbol,
    timeframe,
    time,
    price,
    color: options.color ?? '#06b6d4',
    lineStyle: options.lineStyle ?? 'dashed',
    lineWidth: options.lineWidth ?? 1,
    label: options.label,
    showPrice: options.showPrice ?? true,
    showTime: options.showTime ?? true,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createRectangleAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  options: Partial<Omit<RectangleAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'createdAt' | 'updatedAt'>> = {}
): RectangleAnnotation => {
  const now = Date.now();
  return {
    id: `rect-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'rectangle',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    color: options.color ?? '#3b82f6',
    fillOpacity: options.fillOpacity ?? 0.15,
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createEmojiAnnotation = (
  symbol: string,
  timeframe: string,
  time: number,
  price: number,
  emoji: string,
  options: Partial<Omit<EmojiAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time' | 'price' | 'emoji' | 'createdAt' | 'updatedAt'>> = {}
): EmojiAnnotation => {
  const now = Date.now();
  return {
    id: `emoji-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'emoji',
    symbol,
    timeframe,
    time,
    price,
    emoji,
    size: options.size ?? 24,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createTimeRangeAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  time2: number,
  options: Partial<Omit<TimeRangeAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'time2' | 'createdAt' | 'updatedAt'>> = {}
): TimeRangeAnnotation => {
  const now = Date.now();
  return {
    id: `timerange-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'timerange',
    symbol,
    timeframe,
    time1,
    time2,
    color: options.color ?? '#8b5cf6',
    fillOpacity: options.fillOpacity ?? 0.12,
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1,
    label: options.label,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createArrowAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  text: string,
  options: Partial<Omit<ArrowAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'text' | 'createdAt' | 'updatedAt'>> = {}
): ArrowAnnotation => {
  const now = Date.now();
  return {
    id: `arrow-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'arrow',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    text,
    color: options.color ?? '#f97316',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1.5,
    fontSize: options.fontSize ?? 12,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createChannelAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  priceOffset: number,
  options: Partial<Omit<ChannelAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'priceOffset' | 'createdAt' | 'updatedAt'>> = {}
): ChannelAnnotation => {
  const now = Date.now();
  return {
    id: `channel-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'channel',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    priceOffset,
    color: options.color ?? '#8b5cf6',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    fillOpacity: options.fillOpacity ?? 0.08,
    extendLeft: options.extendLeft ?? false,
    extendRight: options.extendRight ?? false,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createFibRetracementAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  options: Partial<Omit<FibRetracementAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'createdAt' | 'updatedAt'>> = {}
): FibRetracementAnnotation => {
  const now = Date.now();
  return {
    id: `fib-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'fibRetracement',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    color: options.color ?? '#f59e0b',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1,
    label: options.label,
    fillOpacity: options.fillOpacity ?? 0.1,
    levels: options.levels ?? [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    showExtensions: options.showExtensions ?? false,
    extendRight: options.extendRight ?? true,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createMeasureAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  options: Partial<Omit<MeasureAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'createdAt' | 'updatedAt'>> = {}
): MeasureAnnotation => {
  const now = Date.now();
  return {
    id: `measure-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'measure',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    color: options.color ?? '#f97316',
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createAlertLineAnnotation = (
  symbol: string,
  timeframe: string,
  price: number,
  options: Partial<Omit<AlertLineAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'price' | 'createdAt' | 'updatedAt'>> = {}
): AlertLineAnnotation => {
  const now = Date.now();
  return {
    id: `alert_line-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'alert_line',
    symbol,
    timeframe,
    price,
    color: options.color ?? '#f59e0b',
    lineStyle: options.lineStyle ?? 'dashed',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    showPrice: options.showPrice ?? true,
    triggered: options.triggered ?? false,
    direction: options.direction ?? 'above',
    alertId: options.alertId,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createBrushAnnotation = (
  symbol: string,
  timeframe: string,
  points: { t: number; v: number }[],
  options: Partial<Omit<BrushAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'points' | 'createdAt' | 'updatedAt'>> = {}
): BrushAnnotation => {
  const now = Date.now();
  return {
    id: `brush-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'brush',
    symbol,
    timeframe,
    points,
    color: options.color ?? '#3b82f6',
    lineWidth: options.lineWidth ?? 2,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createPitchforkAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  time3: number,
  price3: number,
  options: Partial<Omit<PitchforkAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'time3' | 'price3' | 'createdAt' | 'updatedAt'>> = {}
): PitchforkAnnotation => {
  const now = Date.now();
  return {
    id: `pitchfork-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'pitchfork',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    time3,
    price3,
    color: options.color ?? '#f97316',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1.5,
    label: options.label,
    fillOpacity: options.fillOpacity ?? 0.06,
    extendRight: options.extendRight ?? true,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createFibExtensionAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  price1: number,
  time2: number,
  price2: number,
  time3: number,
  price3: number,
  options: Partial<Omit<FibExtensionAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'price1' | 'time2' | 'price2' | 'time3' | 'price3' | 'createdAt' | 'updatedAt'>> = {}
): FibExtensionAnnotation => {
  const now = Date.now();
  return {
    id: `fib_ext-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'fib_extension',
    symbol,
    timeframe,
    time1,
    price1,
    time2,
    price2,
    time3,
    price3,
    color: options.color ?? '#8b5cf6',
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1,
    label: options.label,
    levels: options.levels ?? [0, 0.618, 1, 1.272, 1.618, 2, 2.618],
    fillOpacity: options.fillOpacity ?? 0.06,
    showPrices: options.showPrices ?? true,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createOrderBlockAnnotation = (
  symbol: string,
  timeframe: string,
  time: number,
  high: number,
  low: number,
  direction: 'bullish' | 'bearish',
  options: Partial<Omit<OrderBlockAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time' | 'high' | 'low' | 'direction' | 'createdAt' | 'updatedAt'>> = {}
): OrderBlockAnnotation => {
  const now = Date.now();
  const defaultColor = direction === 'bullish' ? '#22c55e' : '#ef4444';
  return {
    id: `ob-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'order_block',
    symbol,
    timeframe,
    time,
    high,
    low,
    direction,
    state: options.state ?? 'active',
    color: options.color ?? defaultColor,
    fillOpacity: options.fillOpacity ?? 0.25,
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1,
    label: options.label,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createFairValueGapAnnotation = (
  symbol: string,
  timeframe: string,
  time1: number,
  time2: number,
  top: number,
  bottom: number,
  direction: 'bullish' | 'bearish',
  options: Partial<Omit<FairValueGapAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time1' | 'time2' | 'top' | 'bottom' | 'direction' | 'createdAt' | 'updatedAt'>> = {}
): FairValueGapAnnotation => {
  const now = Date.now();
  const defaultColor = direction === 'bullish' ? '#22c55e' : '#ef4444';
  return {
    id: `fvg-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'fair_value_gap',
    symbol,
    timeframe,
    time1,
    time2,
    top,
    bottom,
    direction,
    filled: options.filled ?? false,
    color: options.color ?? defaultColor,
    fillOpacity: options.fillOpacity ?? 0.2,
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 1,
    label: options.label,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

export const createBosLineAnnotation = (
  symbol: string,
  timeframe: string,
  time: number,
  price: number,
  bosType: 'BOS' | 'ChoCH',
  direction: 'bullish' | 'bearish',
  options: Partial<Omit<BosLineAnnotation, 'id' | 'type' | 'symbol' | 'timeframe' | 'time' | 'price' | 'bosType' | 'direction' | 'createdAt' | 'updatedAt'>> = {}
): BosLineAnnotation => {
  const now = Date.now();
  const defaultColor = direction === 'bullish' ? '#22c55e' : '#ef4444';
  return {
    id: `bos-${now}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'bos_line',
    symbol,
    timeframe,
    time,
    price,
    bosType,
    direction,
    confirmed: options.confirmed ?? true,
    color: options.color ?? defaultColor,
    lineStyle: options.lineStyle ?? 'solid',
    lineWidth: options.lineWidth ?? 2,
    showPrice: options.showPrice ?? true,
    showLabel: options.showLabel ?? true,
    visibleTimeframes: options.visibleTimeframes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
};

// Color palette for quick selection
export const ANNOTATION_COLORS = [
  '#ef4444', // red
  '#f97316', // orange  
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#64748b', // slate
  '#ffffff', // white
] as const;
