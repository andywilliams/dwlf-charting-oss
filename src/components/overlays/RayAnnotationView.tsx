import React, { useMemo } from 'react';
import type { RayAnnotation, TrendLineAnnotation, PaneComputedScale, XScale } from '../../charting/types';
import TrendLineAnnotationView from './TrendLineAnnotationView';

export interface RayAnnotationViewProps {
  annotation: RayAnnotation;
  xScale: XScale;
  yScale: PaneComputedScale;
  chartWidth: number;
  paneHeight: number;
  darkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, update: Partial<RayAnnotation>) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points */
  dataLength?: number;
  /** Pre-computed compressed times array */
  compressedTimes?: number[];
}

/**
 * Ray annotation — a two-point line that starts at point 1 and extends
 * infinitely through and beyond point 2.
 *
 * Internally delegates to TrendLineAnnotationView with extendRight=true
 * and extendLeft=false, avoiding code duplication.
 */
const RayAnnotationView: React.FC<RayAnnotationViewProps> = ({
  annotation,
  xScale,
  yScale,
  chartWidth,
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
  // Convert RayAnnotation → TrendLineAnnotation with fixed extend flags
  const trendLineAnnotation: TrendLineAnnotation = useMemo(() => ({
    ...annotation,
    type: 'trendline' as const,
    extendLeft: false,
    extendRight: true,
  }), [annotation]);

  // Wrap onMove to convert TrendLine updates back to Ray updates
  const handleMove = useMemo(() => {
    if (!onMove) return undefined;
    return (id: string, update: Partial<TrendLineAnnotation>) => {
      // Strip extend fields — Ray doesn't have them
      const { extendLeft: _el, extendRight: _er, type: _t, ...rayUpdate } = update;
      onMove(id, rayUpdate as Partial<RayAnnotation>);
    };
  }, [onMove]);

  return (
    <TrendLineAnnotationView
      annotation={trendLineAnnotation}
      xScale={xScale}
      yScale={yScale}
      chartWidth={chartWidth}
      paneHeight={paneHeight}
      darkMode={darkMode}
      selected={selected}
      onSelect={onSelect}
      onMove={handleMove}
      timeToIndex={timeToIndex}
      indexToTime={indexToTime}
      dataLength={dataLength}
      compressedTimes={compressedTimes}
    />
  );
};

export default RayAnnotationView;
