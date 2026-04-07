import './DWLFChart.css';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as d3 from 'd3';
import MarkerOverlay from './overlays/MarkerOverlay.jsx';
import PositionOverlay from './overlays/PositionOverlay.jsx';
import useChartPanZoomVirtual from '../hooks/useChartPanZoomVirtual.js';
import useContainerSize from '../hooks/useContainerSize';
import type {
  Annotation,
  ChartSpec,
  LinePoint,
  OhlcPoint,
  PaneComputedScale,
  PaneGuide,
  PaneSpec,
  SeriesSpec,
} from '../charting/types';
import type { ChartAnimationState } from '../hooks/useChartAnimations';
import AnnotationLayer from './overlays/AnnotationLayer';
import {
  buildPaneScales,
  collectSpecTimes,
  findClosestTime,
} from '../charting/scales';

const DEFAULT_HEIGHT = 400;
const PANE_SPACING = 16;
const defaultTimeFormatter = d3.utcFormat('%Y-%m-%d %H:%M');

interface PaneRect {
  pane: PaneSpec;
  y: number;
  height: number;
}

type HoverSeries = {
  key: string;
  color?: string;
  value: number | null;
  display: string;
  raw: any;
};

type HoverPane = {
  y: number | null;
  series: HoverSeries[];
  lineVisible: boolean;
};

type HoverState = {
  time: number;
  x: number;
  perPane: Record<string, HoverPane>;
};

type MarkerDatum = {
  t: number;
  v: number;
  label?: string;
  shape?: 'arrow-up' | 'arrow-down' | 'circle' | 'none';
  color?: string;
  size?: number;
  offsetY?: number;
  fontSize?: number;
  textColor?: string;
  textOffsetY?: number;
  tooltip?: string;
  text?: string;
};

type PositionDatumMessage = {
  t: number;
  v: number;
  text: string;
};

type PositionDatum = {
  start: number;
  end?: number;
  entry: number;
  stop: number;
  target: number;
  messages?: PositionDatumMessage[];
  riskColor?: string;
  rewardColor?: string;
  bubbleColor?: string;
  textColor?: string;
  fontSize?: number;
  pointer?: boolean;
  padding?: number;
};

// Internal D3 scale type - distinct from the simpler XScale interface in charting/types.ts
// which is used for annotation component props
type D3XScale = d3.ScaleTime<number, number> | d3.ScaleLinear<number, number>;

const isLinePointArray = (data: any[]): data is LinePoint[] => {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true;
  const sample = data[0];
  return sample && typeof sample.t === 'number' && typeof sample.v === 'number';
};

const isOhlcArray = (data: any[]): data is OhlcPoint[] => {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true;
  const sample = data[0];
  return (
    sample
    && typeof sample.t === 'number'
    && typeof sample.o === 'number'
    && typeof sample.h === 'number'
    && typeof sample.l === 'number'
    && typeof sample.c === 'number'
  );
};

const formatNumber = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN)) return '—';
  const abs = Math.abs(value as number);
  if (abs >= 1000) return (value as number).toFixed(0);
  if (abs >= 100) return (value as number).toFixed(1);
  return (value as number).toFixed(2);
};

const formatTime = (value: number, formatter?: (t: number) => string) => (
  formatter ? formatter(value) : defaultTimeFormatter(new Date(value))
);

const cloneSeries = (series: SeriesSpec): SeriesSpec => ({
  ...series,
  data: Array.isArray(series.data) ? [...series.data] : [],
  style: series.style ? { ...series.style } : undefined,
});

const clonePane = (pane: PaneSpec): PaneSpec => ({
  ...pane,
  series: pane.series.map(cloneSeries),
  guides: pane.guides ? pane.guides.map(guide => ({ ...guide })) : undefined,
});

const cloneSpec = (spec?: ChartSpec): ChartSpec => ({
  panes: spec ? spec.panes.map(clonePane) : [],
  timeFormatter: spec?.timeFormatter,
  onCrosshairMove: spec?.onCrosshairMove,
  onSeriesPointClick: spec?.onSeriesPointClick,
  includeOverlaysInAutoScale: spec?.includeOverlaysInAutoScale,
});

const computePaneRects = (spec: ChartSpec, totalHeight: number): { rects: PaneRect[]; heights: Record<string, number> } => {
  if (!spec.panes.length || totalHeight <= 0) {
    return { rects: [], heights: {} };
  }

  const ratios = spec.panes.map(pane => (pane.heightRatio > 0 ? pane.heightRatio : 1));
  const totalRatio = ratios.reduce((acc, ratio) => acc + ratio, 0);
  const gap = Math.max(0, spec.panes.length - 1) * PANE_SPACING;
  const available = Math.max(0, totalHeight - gap);

  const rects: PaneRect[] = [];
  const heights: Record<string, number> = {};
  let y = 0;

  spec.panes.forEach((pane, index) => {
    const ratio = ratios[index];
    const height = available * (ratio / totalRatio);
    rects.push({ pane, y, height });
    heights[pane.id] = height;
    y += height + PANE_SPACING;
  });

  return { rects, heights };
};

const findNearestLinePoint = (data: LinePoint[], time: number): LinePoint | null => {
  if (!data.length) return null;
  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = data[mid];
    if (current.t === time) return current;
    if (current.t < time) low = mid + 1;
    else high = mid - 1;
  }
  const before = data[Math.max(0, high)];
  const after = data[Math.min(data.length - 1, low)];
  return Math.abs(before.t - time) <= Math.abs(after.t - time) ? before : after;
};

const findNearestOhlcPoint = (data: OhlcPoint[], time: number): OhlcPoint | null => {
  if (!data.length) return null;
  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = data[mid];
    if (current.t === time) return current;
    if (current.t < time) low = mid + 1;
    else high = mid - 1;
  }
  const before = data[Math.max(0, high)];
  const after = data[Math.min(data.length - 1, low)];
  return Math.abs(before.t - time) <= Math.abs(after.t - time) ? before : after;
};

const computeCandleWidth = (data: OhlcPoint[], xScale: D3XScale, chartWidth: number): number => {
  if (!data.length) return Math.max(1, chartWidth * 0.01);
  if (data.length === 1) return Math.max(4, Math.min(24, chartWidth * 0.6));
  let minDiff = Infinity;
  for (let i = 1; i < data.length; i += 1) {
    const prev = xScale(data[i - 1].t);
    const next = xScale(data[i].t);
    const diff = Math.abs(next - prev);
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
    }
  }
  if (!Number.isFinite(minDiff) || minDiff === Infinity) {
    minDiff = chartWidth / data.length;
  }
  return Math.max(1, Math.min(24, minDiff * 0.7));
};

const computePointBandwidth = (
  points: Array<{ t: number }>,
  xScale: D3XScale,
): number => {
  if (!Array.isArray(points) || points.length === 0) {
    return 6;
  }
  if (points.length === 1) {
    return Math.max(4, Math.min(16, 12));
  }
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let minSpacing = Infinity;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = xScale(sorted[i - 1].t);
    const next = xScale(sorted[i].t);
    const diff = Math.abs(next - prev);
    if (diff > 0 && diff < minSpacing) {
      minSpacing = diff;
    }
  }
  if (!Number.isFinite(minSpacing) || minSpacing === Infinity) {
    return 6;
  }
  return Math.max(4, Math.min(18, minSpacing * 0.5));
};

const renderLineLikeSeries = (
  series: SeriesSpec,
  data: LinePoint[],
  scale: PaneComputedScale,
  xScale: D3XScale,
  animationState?: ChartAnimationState,
) => {
  const style = series.style ?? {};
  const strokeWidth = style.lineWidth ?? 1.5;
  const stroke = style.color ?? '#6b7280';
  const baseOpacity = style.opacity ?? 1;
  const dash = style.dashed ? '4 4' : undefined;

  // Apply animation layer opacity if available
  // During animation, default to hidden (0) until the indicators phase reveals each layer
  const isAnimating = animationState && animationState.phase !== 'complete';
  const layerOpacity = animationState?.layerOpacities?.[series.key] ?? (isAnimating ? 0 : 1);
  const opacity = baseOpacity * layerOpacity;

  if (series.type === 'hist') {
    let minSpacing = Infinity;
    for (let i = 1; i < data.length; i += 1) {
      const prev = xScale(data[i - 1].t);
      const next = xScale(data[i].t);
      const diff = Math.abs(next - prev);
      if (diff > 0 && diff < minSpacing) {
        minSpacing = diff;
      }
    }
    if (!Number.isFinite(minSpacing) || minSpacing === Infinity) {
      minSpacing = 8;
    }
    const half = Math.max(2, Math.min(12, minSpacing * 0.4));
    let path = '';
    data.forEach(point => {
      const x = xScale(point.t);
      const base = scale.scale(0);
      const y = scale.scale(point.v);
      const top = Math.min(y, base);
      const bottom = Math.max(y, base);
      path += `M${x - half},${top}H${x + half}V${bottom}H${x - half}Z`;
    });
    return <path d={path} fill={stroke} opacity={opacity * 0.85} stroke="none" />;
  }

  if (series.type === 'area') {
    const area = d3.area<LinePoint>()
      .defined(point => Number.isFinite(point.v))
      .x(point => xScale(point.t))
      .y0(() => scale.scale(scale.domain[0]))
      .y1(point => scale.scale(point.v));
    const path = area(data);
    if (!path) return null;
    return <path d={path} fill={stroke} opacity={Math.min(0.4, opacity)} stroke="none" />;
  }

  const line = d3.line<LinePoint>()
    .defined(point => Number.isFinite(point.v))
    .x(point => xScale(point.t))
    .y(point => scale.scale(point.v));

  const path = line(data);
  if (!path) return null;
  return <path d={path} stroke={stroke} strokeWidth={strokeWidth} fill="none" opacity={opacity} strokeDasharray={dash} />;
};

const renderMarkerSeries = (
  series: SeriesSpec,
  rawData: MarkerDatum[],
  scale: PaneComputedScale,
  xScale: D3XScale,
  animationState?: ChartAnimationState,
) => {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return null;
  }

  // Hide markers during early animation phases — only show from 'events' phase onward
  const phase = animationState?.phase;
  if (phase && phase !== 'events' && phase !== 'annotations' && phase !== 'complete') {
    return null;
  }

  const bandwidth = computePointBandwidth(rawData, xScale);
  const defaultShape = series.style?.markerShape ?? 'circle';
  const defaultSize = series.style?.markerSize ?? 6;
  const defaultColor = series.style?.color ?? '#fbbf24';
  const defaultOffsetY = series.style?.markerOffsetY ?? 0;
  const defaultFontSize = series.style?.markerFontSize ?? 10;
  const defaultTextColor = series.style?.markerTextColor ?? defaultColor;
  const defaultTextOffsetY = series.style?.markerTextOffsetY ?? 0;

  type MarkerGroupKey = {
    shape: 'arrow-up' | 'arrow-down' | 'circle';
    size: number;
    color: string;
    offsetY: number;
    fontSize: number;
    textColor: string;
    textOffsetY: number;
  };

  const groupMap = new Map<string, { key: MarkerGroupKey; points: MarkerDatum[] }>();
  const animationOrderMap = new Map<MarkerDatum, number>();
  let animationOrder = 0;

  rawData.forEach(point => {
    if (!Number.isFinite(point?.t) || !Number.isFinite(point?.v)) {
      return;
    }
    animationOrderMap.set(point, animationOrder);
    animationOrder += 1;
    const shape = point.shape ?? defaultShape;
    const size = point.size ?? defaultSize;
    const color = point.color ?? defaultColor;
    const offsetY = point.offsetY ?? defaultOffsetY;
    const fontSize = point.fontSize ?? defaultFontSize;
    const textColor = point.textColor ?? defaultTextColor;
    const textOffsetY = point.textOffsetY ?? defaultTextOffsetY;
    const keyObj: MarkerGroupKey = { shape, size, color, offsetY, fontSize, textColor, textOffsetY };
    const key = JSON.stringify(keyObj);
    if (!groupMap.has(key)) {
      groupMap.set(key, { key: keyObj, points: [] });
    }
    groupMap.get(key)!.points.push(point);
  });

  if (!groupMap.size) {
    return null;
  }

  const yScale = (value: number) => scale.scale(value);
  let markerIndexOffset = 0;

  return (
    <g className="dwlf-marker-series">
      {Array.from(groupMap.values()).map(({ key, points }, index) => {
        const staggerStartIndex = markerIndexOffset;
        markerIndexOffset += points.length;
        return (
          <MarkerOverlay
          // Using index is acceptable because order is stable for the grouped map
          // eslint-disable-next-line react/no-array-index-key
          key={`${series.key}-marker-${index}`}
          points={points.map(point => ({
            date: point.t,
            actualTime: point.__rawTime ?? point.t,
            price: point.v,
            text: point.label,
            tooltip: point.tooltip || point.text,
            animationOrder: animationOrderMap.get(point),
          }))}
          xScale={xScale}
          yScale={yScale}
          xBandwidth={bandwidth}
          shape={key.shape}
          size={key.size}
          color={key.color}
          offsetY={key.offsetY}
          fontSize={key.fontSize}
          textColor={key.textColor}
          textOffsetY={key.textOffsetY}
          animationPhase={animationState?.phase}
          staggerDelay={100}
          staggerStartIndex={staggerStartIndex}
        />
        );
      })}
    </g>
  );
};

const renderPositionSeries = (
  series: SeriesSpec,
  rawData: PositionDatum[],
  scale: PaneComputedScale,
  xScale: D3XScale,
  chartWidth: number,
) => {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return null;
  }

  const height = Math.abs(scale.scale(scale.domain[0]) - scale.scale(scale.domain[1]));
  if (!Number.isFinite(height) || height === 0) {
    return null;
  }

  const timePoints = rawData.flatMap(point => {
    const values: Array<{ t: number }> = [];
    if (Number.isFinite(point.start)) {
      values.push({ t: point.start });
    }
    if (Number.isFinite(point.end ?? NaN)) {
      values.push({ t: point.end as number });
    }
    return values;
  });

  const bandwidth = computePointBandwidth(timePoints, xScale);
  const defaultRiskColor = series.style?.riskColor ?? 'rgba(255, 107, 107, 0.25)';
  const defaultRewardColor = series.style?.rewardColor ?? 'rgba(76, 175, 80, 0.25)';
  const defaultBubbleColor = series.style?.bubbleColor ?? 'rgba(0,0,0,0.85)';
  const defaultTextColor = series.style?.textColor ?? 'white';
  const defaultFontSize = series.style?.fontSize ?? 11;
  const defaultPointer = series.style?.pointer ?? true;
  const defaultPadding = series.style?.padding ?? 6;

  const yScale = (value: number) => scale.scale(value);

  return (
    <g className="dwlf-position-series">
      {rawData.map((trade, index) => {
        if (
          !Number.isFinite(trade?.start)
          || !Number.isFinite(trade?.entry)
          || !Number.isFinite(trade?.stop)
          || !Number.isFinite(trade?.target)
        ) {
          return null;
        }

        const messages = Array.isArray(trade.messages)
          ? trade.messages
              .filter(message => Number.isFinite(message?.t) && Number.isFinite(message?.v) && message?.text)
              .map(message => ({
                date: message.t,
                actualTime: message.__rawTime ?? message.t,
                price: message.v,
                text: message.text,
              }))
          : undefined;

        return (
          <PositionOverlay
            // eslint-disable-next-line react/no-array-index-key
            key={`${series.key}-position-${index}`}
            startDate={trade.start}
            endDate={Number.isFinite(trade.end ?? NaN) ? (trade.end as number) : undefined}
            entryPrice={trade.entry}
            stopPrice={trade.stop}
            takePrice={trade.target}
            xScale={xScale}
            yScale={yScale}
            xBandwidth={bandwidth}
            chartWidth={chartWidth}
            chartHeight={height}
            riskColor={trade.riskColor ?? defaultRiskColor}
            rewardColor={trade.rewardColor ?? defaultRewardColor}
            messages={messages}
            bubbleColor={trade.bubbleColor ?? defaultBubbleColor}
            textColor={trade.textColor ?? defaultTextColor}
            fontSize={trade.fontSize ?? defaultFontSize}
            pointer={trade.pointer ?? defaultPointer}
            padding={trade.padding ?? defaultPadding}
          />
        );
      })}
    </g>
  );
};

const renderOhlcSeries = (
  series: SeriesSpec,
  data: OhlcPoint[],
  scale: PaneComputedScale,
  xScale: D3XScale,
  chartWidth: number,
  darkMode: boolean,
  animationState?: ChartAnimationState,
) => {
  const candleWidth = computeCandleWidth(data, xScale, chartWidth);
  const halfWidth = candleWidth / 2;
  const baseColor = series.style?.color ?? (darkMode ? '#22c55e' : '#16a34a');
  const parsed = d3.color(baseColor);
  const bearFallback = darkMode ? '#ef4444' : '#b91c1c';
  const bearColor = parsed ? parsed.darker(1.2).formatHex() : bearFallback;
  const bullColor = baseColor;

  // Filter candles based on animation state
  let visibleData = data;
  if (animationState?.phase === 'background' || animationState?.phase === 'idle') {
    visibleData = []; // Hide all candles before animation starts
  } else if (animationState?.phase === 'candles') {
    visibleData = data.slice(0, animationState.candleRevealIndex + 1);
  }

  // Helper function to calculate opacity for leading edge fade
  const getCandleOpacity = (index: number): number => {
    if (!animationState || animationState.phase !== 'candles') {
      return 0.9; // Default opacity when not animating
    }
    
    const revealIndex = animationState.candleRevealIndex;
    const fadeZone = 10; // Number of candles in fade zone
    
    if (index <= revealIndex - fadeZone) {
      return 0.9; // Fully visible
    }
    if (index > revealIndex) {
      return 0; // Hidden
    }
    
    // Gradient fade for leading edge
    const fadeProgress = (revealIndex - index) / fadeZone;
    return Math.max(0, Math.min(0.9, fadeProgress * 0.9));
  };

  let wickPath = '';
  let bullPath = '';
  let bearPath = '';
  const candleElements: JSX.Element[] = [];

  // Render candles with individual opacity for smooth animation
  visibleData.forEach((point, index) => {
    const x = xScale(point.t);
    const high = scale.scale(point.h);
    const low = scale.scale(point.l);
    const open = scale.scale(point.o);
    const close = scale.scale(point.c);
    const opacity = getCandleOpacity(index);

    // Skip invisible candles
    if (opacity === 0) return;

    // Build individual paths for this candle
    const wickSegment = `M${x},${high}L${x},${low}`;
    const top = Math.min(open, close);
    const bottom = Math.max(open, close);
    const left = x - halfWidth;
    const right = x + halfWidth;
    const bodyHeight = Math.max(1, bottom - top);
    const rectPath = `M${left},${top}H${right}V${top + bodyHeight}H${left}Z`;

    const isBull = point.c >= point.o;
    
    // For gradient fade effect, render candles individually during animation
    if (animationState?.phase === 'candles' && opacity < 0.9) {
      candleElements.push(
        <g key={`candle-${index}`} className="dwlf-candle-individual">
          <path 
            d={wickSegment} 
            strokeWidth={1} 
            stroke={darkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.8)'} 
            fill="none" 
            opacity={opacity}
          />
          <path 
            d={rectPath} 
            fill={isBull ? bullColor : bearColor} 
            stroke="none" 
            opacity={opacity}
          />
        </g>
      );
    } else {
      // Add to combined paths for fully visible candles
      wickPath += wickSegment;
      if (isBull) {
        bullPath += rectPath;
      } else {
        bearPath += rectPath;
      }
    }
  });

  return (
    <g className="dwlf-candles">
      {/* Combined paths for fully visible candles */}
      {wickPath && (
        <path 
          d={wickPath} 
          strokeWidth={1} 
          stroke={darkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.8)'} 
          fill="none" 
        />
      )}
      {bullPath && (
        <path 
          d={bullPath} 
          fill={bullColor} 
          stroke="none" 
          opacity={0.9} 
        />
      )}
      {bearPath && (
        <path 
          d={bearPath} 
          fill={bearColor} 
          stroke="none" 
          opacity={0.9} 
        />
      )}
      
      {/* Individual candles for fade effect */}
      {candleElements}
    </g>
  );
};

const filterSeriesDataForRange = (
  series: SeriesSpec,
  startTime: number,
  endTime: number,
  slotMs: number,
) => {
  const buffer = slotMs;
  const windowStart = startTime - buffer;
  const windowEnd = endTime + buffer;

  const inWindow = (value: number | undefined | null) => {
    if (!Number.isFinite(value ?? NaN)) {
      return false;
    }
    const numeric = value as number;
    return numeric >= windowStart && numeric <= windowEnd;
  };

  if (!Array.isArray(series.data)) {
    return [];
  }

  if (series.type === 'ohlc') {
    return series.data.filter((point: any) => inWindow(point?.t));
  }

  if (series.type === 'line' || !series.type) {
    if (series.data.length === 2) {
      const first = series.data[0] as { t?: number | null };
      const second = series.data[1] as { t?: number | null };
      const hasFiniteTimes =
        Number.isFinite(first?.t ?? NaN) && Number.isFinite(second?.t ?? NaN);
      if (hasFiniteTimes) {
        const firstTime = Number(first?.t);
        const secondTime = Number(second?.t);
        const segmentStart = Math.min(firstTime, secondTime);
        const segmentEnd = Math.max(firstTime, secondTime);
        const segmentInWindow = segmentEnd >= windowStart && segmentStart <= windowEnd;
        if (inWindow(firstTime) || inWindow(secondTime) || segmentInWindow) {
          return series.data;
        }
      }
    }
    return series.data.filter((point: any) => inWindow(point?.t));
  }

  if (series.type === 'hist' || series.type === 'area') {
    return series.data.filter((point: any) => inWindow(point?.t));
  }

  if (series.type === 'marker') {
    return series.data.filter((point: any) => inWindow(point?.t));
  }

  if (series.type === 'position') {
    return series.data.filter((point: any) => {
      const start = Number.isFinite(point?.start) ? Number(point.start) : Number(point?.t) || 0;
      const rawEnd = Number.isFinite(point?.end) ? Number(point.end) : undefined;
      const end = rawEnd ?? start;
      return end >= windowStart && start <= windowEnd;
    });
  }

  return series.data;
};

const renderSeries = (
  series: SeriesSpec,
  scale: PaneComputedScale,
  xScale: D3XScale,
  chartWidth: number,
  darkMode: boolean,
  animationState?: ChartAnimationState,
) => {
  if (!Array.isArray(series.data) || series.data.length === 0) {
    return null;
  }

  // Hide all data layers during loading phase - show chart background only
  if (animationState?.phase === 'loading') {
    return null;
  }

  if (series.type === 'ohlc' && isOhlcArray(series.data)) {
    return renderOhlcSeries(series, series.data, scale, xScale, chartWidth, darkMode, animationState);
  }
  if (series.type === 'marker') {
    return renderMarkerSeries(series, series.data as MarkerDatum[], scale, xScale, animationState);
  }
  if (series.type === 'position') {
    return renderPositionSeries(series, series.data as PositionDatum[], scale, xScale, chartWidth);
  }
  if (isLinePointArray(series.data)) {
    return renderLineLikeSeries(series, series.data, scale, xScale, animationState);
  }
  return null;
};

const computeSeriesHover = (series: SeriesSpec, time: number): HoverSeries => {
  if (!Array.isArray(series.data) || series.data.length === 0) {
    return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
  }

  if (series.type === 'ohlc' && isOhlcArray(series.data)) {
    const point = findNearestOhlcPoint(series.data, time);
    if (!point) {
      return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
    }
    const display = series.tooltipFormatter
      ? series.tooltipFormatter(point)
      : `O ${formatNumber(point.o)}  H ${formatNumber(point.h)}  L ${formatNumber(point.l)}  C ${formatNumber(point.c)}`;
    return { key: series.key, color: series.style?.color, value: point.c ?? null, display, raw: point };
  }

  if (series.type === 'marker') {
    const data = (series.data as MarkerDatum[])
      .filter(point => Number.isFinite(point?.t) && Number.isFinite(point?.v));
    if (!data.length) {
      return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
    }
    const linePoints: LinePoint[] = data.map(point => ({ t: point.t, v: point.v }));
    const nearest = findNearestLinePoint(linePoints, time);
    if (!nearest) {
      return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
    }
    const match = data.find(point => point.t === nearest.t && point.v === nearest.v) ?? null;
    const display = series.tooltipFormatter
      ? series.tooltipFormatter(match ?? nearest)
      : match?.label
        ? `${match.label} ${formatNumber(nearest.v)}`
        : formatNumber(nearest.v);
    const color = match?.color ?? series.style?.color;
    return { key: series.key, color, value: nearest.v ?? null, display, raw: match ?? nearest };
  }

  if (series.type === 'position') {
    const data = (series.data as PositionDatum[])
      .filter(point => Number.isFinite(point?.start) && Number.isFinite(point?.entry) && Number.isFinite(point?.stop) && Number.isFinite(point?.target));
    if (!data.length) {
      return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
    }

    const nearest = data.reduce<PositionDatum | null>((acc, current) => {
      const startDiff = Math.abs(current.start - time);
      const endCandidate = Number.isFinite(current.end ?? NaN) ? Math.abs((current.end as number) - time) : startDiff;
      const diff = Math.min(startDiff, endCandidate);
      if (!acc) {
        return current;
      }
      const accStartDiff = Math.abs(acc.start - time);
      const accEndDiff = Number.isFinite(acc.end ?? NaN) ? Math.abs((acc.end as number) - time) : accStartDiff;
      const accDiff = Math.min(accStartDiff, accEndDiff);
      return diff < accDiff ? current : acc;
    }, null);

    if (!nearest) {
      return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
    }

    const display = series.tooltipFormatter
      ? series.tooltipFormatter(nearest)
      : `Entry ${formatNumber(nearest.entry)}  Stop ${formatNumber(nearest.stop)}  Target ${formatNumber(nearest.target)}`;

    const color = series.style?.color ?? series.style?.riskColor ?? 'rgba(239, 68, 68, 0.8)';

    return { key: series.key, color, value: nearest.entry ?? null, display, raw: nearest };
  }

  if (isLinePointArray(series.data)) {
    const point = findNearestLinePoint(series.data, time);
    if (!point) {
      return { key: series.key, color: series.style?.color, value: null, display: '—', raw: null };
    }
    const display = series.tooltipFormatter
      ? series.tooltipFormatter(point)
      : formatNumber(point.v);
    return { key: series.key, color: series.style?.color, value: point.v ?? null, display, raw: point };
  }

  const fallback = series.data.find((item: any) => item && typeof item.t === 'number');
  const display = series.tooltipFormatter ? series.tooltipFormatter(fallback) : '—';
  return { key: series.key, color: series.style?.color, value: null, display, raw: fallback };
};

export interface AxisColorConfig {
  light?: string;
  dark?: string;
}

export interface DWLFChartProps {
  spec?: ChartSpec;
  darkMode?: boolean;
  showGrid?: boolean;
  className?: string;
  style?: React.CSSProperties;
  enablePanZoom?: boolean;
  timeframe?: string;
  initialVisibleCount?: number;
  extraRightSlots?: number;
  compressGaps?: boolean;
  axisColors?: AxisColorConfig;
  crosshairSnapMode?: 'series' | 'pointer';
  /**
   * When true, draw a small price label on the right-hand axis that tracks
   * the crosshair position for each pane.
   *
   * This mirrors the old Chart.js behaviour used in the portfolio frontend
   * and is wired to the global "Crosshair Price Label" user preference.
   */
  showCrosshairPriceLabel?: boolean;
  /**
   * Chart annotations (horizontal lines, text labels) for the price pane.
   * Rendered as an overlay layer above series but below crosshair.
   */
  annotations?: Annotation[];
  /**
   * Currently selected annotation ID (shows selection handles).
   */
  selectedAnnotationId?: string | null;
  /**
   * Callback when an annotation is clicked/selected.
   */
  onAnnotationSelect?: (id: string | null) => void;
  /**
   * Callback when an annotation is moved (drag).
   */
  onAnnotationMove?: (id: string, update: Partial<Annotation>) => void;
  /**
   * Callback when text annotation requests edit (double-click).
   */
  onAnnotationTextEdit?: (id: string) => void;
  /**
   * Callback when an annotation is double-clicked.
   */
  onAnnotationDoubleClick?: (id: string) => void;
  /**
   * Callback when user clicks on chart canvas (for placing annotations).
   * Receives { time, price, paneId, screenX, screenY }.
   */
  onChartCanvasClick?: (info: {
    time: number;
    price: number;
    paneId: string;
    screenX: number;
    screenY: number;
  }) => void;
  /**
   * Callback when user moves mouse over chart canvas (for annotation previews).
   * Only fires when the prop is provided to avoid unnecessary overhead.
   * Receives { time, price, paneId, screenX, screenY }.
   */
  onCanvasMouseMove?: (info: {
    time: number;
    price: number;
    paneId: string;
    screenX: number;
    screenY: number;
  }) => void;
  /**
   * Alias for onCanvasMouseMove - callback when user hovers over chart canvas.
   * Receives { time, price } coordinates for annotation preview generation.
   */
  onChartCanvasHover?: (info: { time: number; price: number }) => void;
  /**
   * Optional animation state for controlling chart reveal animations.
   * When provided, the chart will render based on the current animation phase.
   */
  animationState?: ChartAnimationState;
}

export interface DwlfChartHandle {
  setSpec(spec: ChartSpec): void;
  addPane(pane: PaneSpec): void;
  removePane(paneId: string): void;
  updatePane(paneId: string, patch: Partial<PaneSpec>): void;
  addSeries(paneId: string, series: SeriesSpec): void;
  updateSeries(paneId: string, key: string, data: any[]): void;
  removeSeries(paneId: string, key: string): void;
  addGuide(paneId: string, guide: PaneGuide): void;
  removeGuide(paneId: string, y: number): void;
  enableSharedCrosshair(enabled: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  panToStart(): void;
  panToEnd(): void;
}

const DWLFChart = forwardRef<DwlfChartHandle, DWLFChartProps>(function DWLFChart(
  {
    spec,
    darkMode = false,
    showGrid = true,
    className,
    style,
    enablePanZoom = false,
    timeframe = 'daily',
    initialVisibleCount = 160,
    extraRightSlots = 30,
    compressGaps = false,
    axisColors,
    crosshairSnapMode = 'series',
    showCrosshairPriceLabel = true,
    annotations = [],
    selectedAnnotationId = null,
    onAnnotationSelect,
    onAnnotationMove,
    onAnnotationTextEdit,
    onAnnotationDoubleClick,
    onChartCanvasClick,
    onCanvasMouseMove,
    onChartCanvasHover,
    animationState,
  },
  ref,
) {
  const [chartSpec, setChartSpec] = useState<ChartSpec>(() => cloneSpec(spec));
  useEffect(() => {
    setChartSpec(cloneSpec(spec));
  }, [spec]);

  const [sharedCrosshair, setSharedCrosshair] = useState(true);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [containerRef, { width, height }] = useContainerSize();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const resolvedHeight = height || DEFAULT_HEIGHT;

  const lowerTimeframe = (timeframe || '').toLowerCase();
  const slotMs = lowerTimeframe === 'hourly' ? 3_600_000 : 86_400_000;

  const baseOhlcSeries = useMemo(() => {
    for (const pane of chartSpec.panes) {
      const found = pane.series.find(series => series.type === 'ohlc' && Array.isArray(series.data));
      if (found) {
        return found;
      }
    }
    return null;
  }, [chartSpec]);

  const baseSeriesData = useMemo(() => {
    if (!baseOhlcSeries || !Array.isArray(baseOhlcSeries.data)) {
      return [] as Array<{ t: number }>;
    }
    return (baseOhlcSeries.data as Array<{ t: number }>).filter(point => Number.isFinite(point?.t));
  }, [baseOhlcSeries]);

  const panData = useMemo(
    () => baseSeriesData.map(point => ({ date: new Date(point.t).toISOString() })),
    [baseSeriesData],
  );

  const panZoom = useChartPanZoomVirtual(panData, initialVisibleCount, extraRightSlots, timeframe);
  const panEnabled = enablePanZoom && baseSeriesData.length > 0;
  const compressEnabled = compressGaps && baseSeriesData.length > 0;

  const {
    mouseHandlers: panMouseHandlers,
    chartElementRef: registerPanElement,
    zoomIn: panZoomIn,
    zoomOut: panZoomOut,
    resetView: panResetView,
    panToStart: panStart,
    panToEnd: panEnd,
  } = panZoom;

  const indexToTime = useCallback(
    (index: number): number => {
      if (!baseSeriesData.length) {
        return Date.now() + index * slotMs;
      }
      if (index <= 0) {
        return baseSeriesData[Math.max(0, index)].t;
      }
      if (index < baseSeriesData.length) {
        return baseSeriesData[index].t;
      }
      const lastTime = baseSeriesData[baseSeriesData.length - 1].t;
      const offset = index - (baseSeriesData.length - 1);
      return lastTime + offset * slotMs;
    },
    [baseSeriesData, slotMs],
  );

  const panRange = useMemo(() => {
    if (!panEnabled) {
      return null;
    }
    const startIndex = panZoom.viewportStart;
    const endIndexExclusive = Math.max(panZoom.viewportEnd, startIndex + 1);
    const startTime = indexToTime(startIndex);
    const rawEndTime = indexToTime(endIndexExclusive);
    const adjustedEndTime = rawEndTime <= startTime ? startTime + slotMs : rawEndTime;
    return {
      startTime,
      endTime: adjustedEndTime,
      viewportStart: panZoom.viewportStart,
      viewportEnd: panZoom.viewportEnd,
      visibleCount: panZoom.visibleCount,
    };
  }, [panEnabled, panZoom.viewportStart, panZoom.viewportEnd, panZoom.visibleCount, indexToTime, slotMs]);

  const panInitializedRef = useRef(false);
  const panDataLengthRef = useRef(baseSeriesData.length);

  useEffect(() => {
    if (!panEnabled) {
      panInitializedRef.current = false;
      return;
    }
    if (baseSeriesData.length === 0) {
      panInitializedRef.current = false;
      return;
    }
    if (!panInitializedRef.current) {
      panResetView();
      panInitializedRef.current = true;
      panDataLengthRef.current = baseSeriesData.length;
      return;
    }
    if (baseSeriesData.length !== panDataLengthRef.current) {
      panResetView();
      panDataLengthRef.current = baseSeriesData.length;
    }
  }, [panEnabled, baseSeriesData.length, panResetView]);

  useEffect(() => {
    if (!panEnabled) return;
    panInitializedRef.current = false;
  }, [spec, panEnabled]);

  const compressedTimeData = useMemo(() => {
    if (!compressEnabled) {
      return null;
    }
    let rawTimes: number[] = [];
    if (panEnabled && panRange) {
      const count = Math.max(0, panRange.viewportEnd - panRange.viewportStart);
      rawTimes = Array.from({ length: count }, (_, idx) => indexToTime(panRange.viewportStart + idx));
    } else {
      rawTimes = collectSpecTimes(chartSpec);
    }
    const unique = Array.from(new Set(rawTimes.filter(time => Number.isFinite(time)))).sort((a, b) => a - b);
    if (!unique.length) {
      return null;
    }
    const rawToIndex = new Map<number, number>();
    unique.forEach((time, idx) => rawToIndex.set(time, idx));
    return { rawToIndex, indexToRaw: unique };
  }, [compressEnabled, panEnabled, panRange, chartSpec, indexToTime]);

  const annotationTimeToIndex = useMemo<((time: number) => number | undefined) | undefined>(() => {
    if (!compressedTimeData) {
      return undefined;
    }
    return (time: number) => compressedTimeData.rawToIndex.get(time);
  }, [compressedTimeData]);

  const annotationIndexToTime = useMemo<((index: number) => number) | undefined>(() => {
    if (!compressedTimeData) {
      return undefined;
    }
    return (index: number) => {
      const maxIndex = compressedTimeData.indexToRaw.length - 1;
      const clamped = Math.max(0, Math.min(maxIndex, index));
      return compressedTimeData.indexToRaw[clamped];
    };
  }, [compressedTimeData]);

  const mergedContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (panEnabled) {
      registerPanElement(node);
    }
    if (containerRef) {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [panEnabled, registerPanElement, containerRef]);

  const specForRender = useMemo(() => {
    const remapGuideTime = (value: number) => {
      if (!compressedTimeData || !Number.isFinite(value)) {
        return value;
      }
      const { rawToIndex, indexToRaw } = compressedTimeData;
      const direct = rawToIndex.get(value);
      if (direct !== undefined) {
        return direct;
      }
      const len = indexToRaw.length;
      if (len > 0 && Number.isInteger(value) && value >= 0 && value <= len - 1) {
        return value;
      }
      if (!len) {
        return value;
      }
      const closestRaw = findClosestTime(indexToRaw, value);
      const closestIdx = rawToIndex.get(closestRaw);
      return closestIdx ?? value;
    };

    const remapGuides = (guides?: PaneGuide[]) => {
      if (!compressedTimeData || !guides) {
        return guides;
      }
      return guides.map((guide) => {
        let next = guide;
        if (Number.isFinite(guide.startTime ?? NaN)) {
          const mapped = remapGuideTime(guide.startTime as number);
          if (mapped !== guide.startTime) {
            next = { ...next, startTime: mapped };
          }
        }
        if (Number.isFinite(guide.endTime ?? NaN)) {
          const mapped = remapGuideTime(guide.endTime as number);
          if (mapped !== guide.endTime) {
            next = next === guide ? { ...next } : next;
            next.endTime = mapped;
          }
        }
        return next;
      });
    };

    const remapSeriesData = (series: SeriesSpec, data: any[]) => {
      if (!compressedTimeData || !Array.isArray(data)) {
        return data;
      }

      if (series.type === 'position') {
        return data.map(point => {
          if (!point) {
            return point;
          }
          const next: any = { ...point };

          const originalStart = point.__rawStart ?? point.start;
          if (Number.isFinite(originalStart)) {
            const idxStart = compressedTimeData.rawToIndex.get(originalStart as number);
            if (idxStart !== undefined) {
              next.__rawStart = originalStart;
              next.start = idxStart;
            }
          }

          if (Number.isFinite(point.end ?? NaN)) {
            const originalEnd = point.__rawEnd ?? point.end;
            if (Number.isFinite(originalEnd)) {
              const idxEnd = compressedTimeData.rawToIndex.get(originalEnd as number);
              if (idxEnd !== undefined) {
                next.__rawEnd = originalEnd;
                next.end = idxEnd;
              }
            }
          }

          if (Array.isArray(point.messages)) {
            next.messages = point.messages.map((message: any) => {
              if (!Number.isFinite(message?.t ?? NaN)) {
                return message;
              }
              const original = message.__rawTime ?? message.t;
              const idxMessage = compressedTimeData.rawToIndex.get(original);
              if (idxMessage === undefined) {
                return message;
              }
              if (message.t === idxMessage && message.__rawTime) {
                return message;
              }
              return { ...message, __rawTime: original, t: idxMessage };
            });
          }

          return next;
        });
      }

      return data.map(point => {
        if (!point || typeof point.t !== 'number') {
          return point;
        }
        const original = point.__rawTime ?? point.t;
        const idx = compressedTimeData.rawToIndex.get(original);
        if (idx === undefined) {
          return point;
        }
        if (point.t === idx && point.__rawTime) {
          return point;
        }
        return { ...point, __rawTime: original, t: idx };
      });
    };

    if (!panEnabled || !panRange) {
      if (!compressedTimeData) {
        return chartSpec;
      }
      const cloned = cloneSpec(chartSpec);
      cloned.panes = cloned.panes.map(pane => ({
        ...pane,
        series: pane.series.map(series => ({
          ...series,
          data: Array.isArray(series.data) ? remapSeriesData(series, series.data) : series.data,
        })),
        guides: remapGuides(pane.guides),
      }));
      return cloned;
    }

    const filtered = cloneSpec(chartSpec);
    filtered.panes = filtered.panes.map(pane => {
      const nextSeries = pane.series.map(series => {
        const filteredData = filterSeriesDataForRange(series, panRange.startTime, panRange.endTime, slotMs);
        if (!Array.isArray(filteredData)) {
          return { ...series, data: filteredData };
        }
        return {
          ...series,
          data: remapSeriesData(series, filteredData),
        };
      });

      return {
        ...pane,
        series: nextSeries,
        guides: remapGuides(pane.guides),
      };
    });
    return filtered;
  }, [chartSpec, panEnabled, panRange, slotMs, indexToTime, compressedTimeData]);

  const { rects: paneRects, heights: paneHeights } = useMemo(
    () => computePaneRects(specForRender, resolvedHeight),
    [specForRender, resolvedHeight],
  );

  const paneRectMap = useMemo(() => {
    const map = new Map<string, PaneRect>();
    paneRects.forEach((rect) => {
      map.set(rect.pane.id, rect);
    });
    return map;
  }, [paneRects]);

  const paneScales = useMemo(
    () => buildPaneScales(specForRender, paneHeights),
    [specForRender, paneHeights],
  );

  const times = useMemo(() => {
    if (compressedTimeData) {
      return compressedTimeData.indexToRaw.map((_, idx) => idx);
    }
    if (!panEnabled || !panRange) {
      return collectSpecTimes(specForRender);
    }
    const indices: number[] = [];
    for (let i = panRange.viewportStart; i < panRange.viewportEnd; i += 1) {
      indices.push(indexToTime(i));
    }
    if (!indices.length) {
      return [panRange.startTime, panRange.endTime];
    }
    return indices;
  }, [compressedTimeData, panEnabled, panRange, specForRender, indexToTime]);

  const xScale = useMemo(() => {
    const safeWidth = Math.max(0, width);
    if (!times.length || safeWidth <= 0) {
      const now = Date.now();
      return d3.scaleUtc().domain([now - 3600000, now]).range([0, safeWidth || 1]);
    }
    if (compressedTimeData) {
      const len = compressedTimeData.indexToRaw.length;
      const end = len > 1 ? len - 1 : 1;
      return d3.scaleLinear().domain([0, end]).range([0, safeWidth]);
    }
    let start = times[0];
    let end = times[times.length - 1];
    if (panEnabled && panRange) {
      start = panRange.startTime;
      end = panRange.endTime;
    }
    if (start === end) {
      end = start + slotMs;
    }
    return d3.scaleUtc().domain([start, end]).range([0, safeWidth]);
  }, [times, width, panEnabled, panRange, slotMs, compressedTimeData]);

  const xTicks = useMemo(() => {
    if (!times.length || width <= 0) return [] as number[];
    const tickCount = Math.min(12, Math.max(2, Math.floor(width / 140)));
    if (compressedTimeData) {
      const len = compressedTimeData.indexToRaw.length;
      if (!len) return [] as number[];
      const scale = d3.scaleLinear().domain([0, Math.max(1, len - 1)]);
      const rawTicks = scale.ticks(tickCount);
      const deduped = Array.from(new Set(rawTicks.map(value => {
        const rounded = Math.round(value);
        return Math.max(0, Math.min(len - 1, rounded));
      })));
      return deduped.sort((a, b) => a - b);
    }
    return xScale
      .ticks(tickCount)
      .map(d => (d instanceof Date ? d.valueOf() : Number(d)));
  }, [xScale, times, width, compressedTimeData]);

  const getRawTimeFromValue = useCallback((value: number) => {
    if (compressedTimeData) {
      if (!compressedTimeData.indexToRaw.length) {
        return value;
      }
      const index = Math.max(0, Math.min(compressedTimeData.indexToRaw.length - 1, Math.round(value)));
      return compressedTimeData.indexToRaw[index];
    }
    return value;
  }, [compressedTimeData]);

  const hover = sharedCrosshair ? hoverState : null;

  const handlePointerMove = useCallback(
    (event: React.MouseEvent<SVGElement>) => {
      if (!sharedCrosshair || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const clampedX = Math.max(0, Math.min(x, Math.max(0, width)));
      const inverted = xScale.invert(clampedX);
      const rawTime = inverted instanceof Date ? inverted.valueOf() : inverted;
      if (!Number.isFinite(rawTime)) {
        setHoverState(null);
        return;
      }
      const closestTime = findClosestTime(times, rawTime);
      if (!Number.isFinite(closestTime)) {
        setHoverState(null);
        return;
      }

      const pointerY = event.clientY - rect.top;

      let pointerPaneId: string | null = null;
      if (crosshairSnapMode === 'pointer') {
        for (const paneRect of paneRectMap.values()) {
          const bottom = paneRect.y + paneRect.height;
          if (pointerY >= paneRect.y && pointerY <= bottom) {
            pointerPaneId = paneRect.pane.id;
            break;
          }
        }
      }

      const perPane: HoverState['perPane'] = {};
      specForRender.panes.forEach(pane => {
        const scale = paneScales[pane.id];
        if (!scale) return;
        const visibleSeries = pane.series.filter(item => item.showInTooltip !== false);
        const series = visibleSeries.map(item => computeSeriesHover(item, closestTime));
        const primary = series.find(entry => Number.isFinite(entry.value ?? NaN));
        const paneRect = paneRectMap.get(pane.id);
        const isPointerPane = crosshairSnapMode === 'pointer' ? pane.id === pointerPaneId : true;

        let y: number | null = null;
        if (crosshairSnapMode === 'pointer' && paneRect && isPointerPane) {
          const relative = pointerY - paneRect.y;
          const clamped = Math.max(0, Math.min(relative, paneRect.height));
          y = Number.isFinite(clamped) ? clamped : 0;
        } else if (primary) {
          y = scale.scale(primary.value as number);
        } else {
          y = scale.scale(scale.domain[0]);
        }

        perPane[pane.id] = {
          y,
          series,
          lineVisible: crosshairSnapMode === 'pointer' ? isPointerPane && paneRect != null : true,
        };
      });

      const displayTime = getRawTimeFromValue(closestTime);

      setHoverState({ time: displayTime, x: xScale(closestTime), perPane });
      specForRender.onCrosshairMove?.(displayTime);

      // Fire canvas mouse move callback for annotation previews
      if (onCanvasMouseMove || onChartCanvasHover) {
        for (const [paneId, paneRect] of paneRectMap.entries()) {
          const bottom = paneRect.y + paneRect.height;
          if (pointerY >= paneRect.y && pointerY <= bottom) {
            const scale = paneScales[paneId];
            if (scale) {
              const relativeY = pointerY - paneRect.y;
              const price = scale.invert(relativeY);
              if (Number.isFinite(price)) {
                // Call the full callback if provided
                onCanvasMouseMove?.({
                  time: displayTime,
                  price,
                  paneId,
                  screenX: event.clientX,
                  screenY: event.clientY,
                });
                // Call the simplified hover callback if provided
                onChartCanvasHover?.({
                  time: displayTime,
                  price,
                });
              }
            }
            break;
          }
        }
      }
    },
    [
      sharedCrosshair,
      svgRef,
      width,
      xScale,
      times,
      specForRender,
      paneScales,
      getRawTimeFromValue,
      paneRectMap,
      crosshairSnapMode,
      onCanvasMouseMove,
      onChartCanvasHover,
    ],
  );

  const handlePointerLeave = useCallback(() => {
    setHoverState(null);
  }, []);

  const handleSeriesClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!sharedCrosshair || !svgRef.current) return;

      let time: number;
      let perPane: HoverState['perPane'];

      if (hoverState) {
        // Use the existing hover state as the source of truth for which
        // series/point is "nearest" to the pointer at the time of click.
        time = hoverState.time;
        perPane = hoverState.perPane;
      } else {
        // If there is no hover state yet (e.g. the user clicked without
        // moving the mouse first), derive the nearest time / series from
        // the click position itself.
        const rect = svgRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const clampedX = Math.max(0, Math.min(x, Math.max(0, width)));
        const inverted = xScale.invert(clampedX);
        const rawTime = inverted instanceof Date ? inverted.valueOf() : inverted;
        if (!Number.isFinite(rawTime)) {
          return;
        }
        const closestTime = findClosestTime(times, rawTime);
        if (!Number.isFinite(closestTime)) {
          return;
        }

        const pointerY = event.clientY - rect.top;

        let pointerPaneId: string | null = null;
        if (crosshairSnapMode === 'pointer') {
          for (const paneRect of paneRectMap.values()) {
            const bottom = paneRect.y + paneRect.height;
            if (pointerY >= paneRect.y && pointerY <= bottom) {
              pointerPaneId = paneRect.pane.id;
              break;
            }
          }
        }

        perPane = {};
        specForRender.panes.forEach(pane => {
          const scale = paneScales[pane.id];
          if (!scale) return;
          const visibleSeries = pane.series.filter(item => item.showInTooltip !== false);
          const series = visibleSeries.map(item => computeSeriesHover(item, closestTime));
          const primary = series.find(entry => Number.isFinite(entry.value ?? NaN));
          const paneRect = paneRectMap.get(pane.id);
          const isPointerPane = crosshairSnapMode === 'pointer' ? pane.id === pointerPaneId : true;

          let y: number | null = null;
          if (crosshairSnapMode === 'pointer' && paneRect && isPointerPane) {
            const relative = pointerY - paneRect.y;
            const clamped = Math.max(0, Math.min(relative, paneRect.height));
            y = Number.isFinite(clamped) ? clamped : 0;
          } else if (primary) {
            y = scale.scale(primary.value as number);
          } else {
            y = scale.scale(scale.domain[0]);
          }

          perPane[pane.id] = {
            y,
            series,
            lineVisible: crosshairSnapMode === 'pointer' ? isPointerPane && paneRect != null : true,
          };
        });

        const displayTime = getRawTimeFromValue(closestTime);
        time = displayTime;
      }

      // Fire canvas click callback (for annotation placement) before series click handling
      if (onChartCanvasClick) {
        const rect = svgRef.current.getBoundingClientRect();
        const pointerY = event.clientY - rect.top;
        
        // Find which pane was clicked
        for (const [paneId, paneRect] of paneRectMap.entries()) {
          const bottom = paneRect.y + paneRect.height;
          if (pointerY >= paneRect.y && pointerY <= bottom) {
            const scale = paneScales[paneId];
            if (scale) {
              const relativeY = pointerY - paneRect.y;
              const price = scale.invert(relativeY);
              if (Number.isFinite(price)) {
                onChartCanvasClick({
                  time,
                  price,
                  paneId,
                  screenX: event.clientX,
                  screenY: event.clientY,
                });
              }
            }
            break;
          }
        }
      }

      // Prefer the first pane that has any series entries with a non-null value.
      for (const pane of specForRender.panes) {
        const hoverInfo = perPane[pane.id];
        const hoverSeries = hoverInfo?.series ?? [];
        const hoverByKey = new Map<string, HoverSeries>();
        hoverSeries.forEach(entry => {
          if (entry && entry.key) {
            hoverByKey.set(entry.key, entry);
          }
        });

        const seriesEntries: HoverSeries[] = pane.series.map(seriesSpec => {
          const existing = hoverByKey.get(seriesSpec.key);
          if (existing) {
            return existing;
          }
          const computed = computeSeriesHover(seriesSpec, time);
          hoverByKey.set(seriesSpec.key, computed);
          return computed;
        });

        // Prefer a series that has an explicit onClick handler defined,
        // falling back to the first series with a non-null raw value.
        let chosen: HoverSeries | null = null;
        let chosenSpec: SeriesSpec | null = null;

        // First pass: any series with onClick?
        // seriesEntries is ordered; we keep that ordering when searching.
        for (const entry of seriesEntries) {
          if (!entry || entry.raw == null) continue;
          const specForKey = pane.series.find(s => s.key === entry.key);
          if (specForKey && typeof specForKey.onClick === 'function') {
            chosen = entry;
            chosenSpec = specForKey;
            break;
          }
        }

        // Second pass: fall back to the first entry with raw != null.
        if (!chosen) {
          const fallback = seriesEntries.find(entry => entry && entry.raw != null);
          if (!fallback) continue;
          chosen = fallback;
          chosenSpec = pane.series.find(s => s.key === fallback.key) ?? null;
        }

        if (!chosen) continue;
        const raw = chosen.raw;

        if (!chosenSpec) {
          // Still allow the global handler to fire with whatever we have.
          specForRender.onSeriesPointClick?.({
            paneId: pane.id,
            seriesKey: chosen.key,
            time,
            raw,
          });
          return;
        }

        // Invoke per-series onClick first (if present), then global handler.
        if (typeof chosenSpec.onClick === 'function') {
          try {
            chosenSpec.onClick(raw);
          } catch (err) {
            // Swallow errors from consumer callbacks to avoid breaking the chart.
            // eslint-disable-next-line no-console
            console.error('DWLFChart: series onClick handler threw', err);
          }
        }

        specForRender.onSeriesPointClick?.({
          paneId: pane.id,
          seriesKey: chosenSpec.key,
          time,
          raw,
        });

        return;
      }
    },
    [
      sharedCrosshair,
      svgRef,
      hoverState,
      specForRender,
      width,
      xScale,
      times,
      paneScales,
      paneRectMap,
      crosshairSnapMode,
      getRawTimeFromValue,
      onChartCanvasClick,
    ],
  );

  const setSpec = useCallback<DwlfChartHandle['setSpec']>((nextSpec) => {
    setChartSpec(cloneSpec(nextSpec));
  }, []);

  const addPane = useCallback<DwlfChartHandle['addPane']>((pane) => {
    setChartSpec(prev => ({
      ...prev,
      panes: [...prev.panes, clonePane(pane)],
    }));
  }, []);

  const removePane = useCallback<DwlfChartHandle['removePane']>((paneId) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.filter(pane => pane.id !== paneId),
    }));
  }, []);

  const updatePane = useCallback<DwlfChartHandle['updatePane']>((paneId, patch) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.map(pane => {
        if (pane.id !== paneId) return pane;
        const next: PaneSpec = { ...pane, ...patch };
        if (patch.series) {
          next.series = patch.series.map(cloneSeries);
        }
        if (patch.guides) {
          next.guides = patch.guides.map(guide => ({ ...guide }));
        }
        return next;
      }),
    }));
  }, []);

  const addSeries = useCallback<DwlfChartHandle['addSeries']>((paneId, series) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.map(pane => {
        if (pane.id !== paneId) return pane;
        const nextSeries = pane.series.some(item => item.key === series.key)
          ? pane.series.map(item => (item.key === series.key ? cloneSeries(series) : item))
          : [...pane.series, cloneSeries(series)];
        return { ...pane, series: nextSeries };
      }),
    }));
  }, []);

  const updateSeries = useCallback<DwlfChartHandle['updateSeries']>((paneId, key, data) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.map(pane => {
        if (pane.id !== paneId) return pane;
        const nextSeries = pane.series.map(series => (
          series.key === key ? { ...series, data: Array.isArray(data) ? [...data] : [] } : series
        ));
        return { ...pane, series: nextSeries };
      }),
    }));
  }, []);

  const removeSeries = useCallback<DwlfChartHandle['removeSeries']>((paneId, key) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.map(pane => (
        pane.id === paneId
          ? { ...pane, series: pane.series.filter(series => series.key !== key) }
          : pane
      )),
    }));
  }, []);

  const addGuide = useCallback<DwlfChartHandle['addGuide']>((paneId, guide) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.map(pane => (
        pane.id === paneId
          ? { ...pane, guides: [...(pane.guides ?? []), { ...guide }] }
          : pane
      )),
    }));
  }, []);

  const removeGuide = useCallback<DwlfChartHandle['removeGuide']>((paneId, y) => {
    setChartSpec(prev => ({
      ...prev,
      panes: prev.panes.map(pane => (
        pane.id === paneId
          ? { ...pane, guides: (pane.guides ?? []).filter(guide => guide.y !== y) }
          : pane
      )),
    }));
  }, []);

  const enableSharedCrosshair = useCallback<DwlfChartHandle['enableSharedCrosshair']>((enabled) => {
    setSharedCrosshair(Boolean(enabled));
    if (!enabled) {
      setHoverState(null);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (panEnabled) {
      panZoomIn();
    }
  }, [panEnabled, panZoomIn]);

  const handleZoomOut = useCallback(() => {
    if (panEnabled) {
      panZoomOut();
    }
  }, [panEnabled, panZoomOut]);

  const handleResetView = useCallback(() => {
    if (panEnabled) {
      panResetView();
    }
  }, [panEnabled, panResetView]);

  const handlePanToStart = useCallback(() => {
    if (panEnabled) {
      panStart();
    }
  }, [panEnabled, panStart]);

  const handlePanToEnd = useCallback(() => {
    if (panEnabled) {
      panEnd();
    }
  }, [panEnabled, panEnd]);

  const handleMouseDownForPan = useCallback((event: React.MouseEvent<SVGElement>) => {
    if (!panEnabled || !panMouseHandlers.onMouseDown) {
      return;
    }
    panMouseHandlers.onMouseDown(event);
  }, [panEnabled, panMouseHandlers]);

  const handleMouseMoveForPan = useCallback((event: React.MouseEvent<SVGElement>) => {
    if (!panEnabled || !panMouseHandlers.onMouseMove) {
      return;
    }
    panMouseHandlers.onMouseMove(event);
  }, [panEnabled, panMouseHandlers]);

  const handleMouseUpForPan = useCallback((event: React.MouseEvent<SVGElement>) => {
    if (!panEnabled || !panMouseHandlers.onMouseUp) {
      return;
    }
    panMouseHandlers.onMouseUp(event);
  }, [panEnabled, panMouseHandlers]);

  const handleMouseLeaveForPan = useCallback((event: React.MouseEvent<SVGElement>) => {
    if (!panEnabled || !panMouseHandlers.onMouseLeave) {
      return;
    }
    panMouseHandlers.onMouseLeave(event);
  }, [panEnabled, panMouseHandlers]);

  useImperativeHandle(ref, () => ({
    setSpec,
    addPane,
    removePane,
    updatePane,
    addSeries,
    updateSeries,
    removeSeries,
    addGuide,
    removeGuide,
    enableSharedCrosshair,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    resetView: handleResetView,
    panToStart: handlePanToStart,
    panToEnd: handlePanToEnd,
  }), [
    setSpec,
    addPane,
    removePane,
    updatePane,
    addSeries,
    updateSeries,
    removeSeries,
    addGuide,
    removeGuide,
    enableSharedCrosshair,
    handleZoomIn,
    handleZoomOut,
    handleResetView,
    handlePanToStart,
    handlePanToEnd,
  ]);

  const background = darkMode ? '#0f172a' : '#ffffff';
  const gridColor = darkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)';
  const axisColor = useMemo(
    () => (darkMode ? axisColors?.dark ?? '#94a3b8' : axisColors?.light ?? '#475569'),
    [axisColors, darkMode],
  );
  const crosshairColor = useMemo(
    () => (darkMode ? axisColors?.dark : axisColors?.light) ?? (darkMode ? '#f1f5f9' : '#0f172a'),
    [axisColors, darkMode],
  );
  const textColor = darkMode ? '#e2e8f0' : '#1f2937';
  const tooltipBackground = darkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255,255,255,0.95)';

  const containerClasses = [
    'dwlf-chart-container',
    className,
    animationState ? 'fade-transition' : '',
    animationState?.phase || '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={mergedContainerRef}
      className={containerClasses}
      style={{ position: 'relative', width: '100%', height: '100%', background, ...(style ?? {}) }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={resolvedHeight}
        className="dwlf-chart-svg"
        onClick={handleSeriesClick}
        onMouseDown={handleMouseDownForPan}
        onMouseMove={(event) => {
          if (panEnabled) {
            handleMouseMoveForPan(event);
          }
          handlePointerMove(event);
        }}
        onMouseUp={handleMouseUpForPan}
        onMouseLeave={(event) => {
          if (panEnabled) {
            handleMouseLeaveForPan(event);
          }
          handlePointerLeave();
        }}
      >
        <rect x={0} y={0} width={width} height={resolvedHeight} fill={background} />
        {paneRects.map(({ pane, y, height: paneHeight }) => {
          const scale = paneScales[pane.id];
          if (!scale) return null;
          const ticks = d3.scaleLinear().domain(scale.domain).ticks(4);
          const hoverInfo = hover?.perPane[pane.id];
          return (
            <g key={pane.id} transform={`translate(0, ${y})`}>
              <rect x={0} y={0} width={width} height={paneHeight} fill={background} />
              {showGrid && xTicks.map((tick, index) => (
                <line
                  // eslint-disable-next-line react/no-array-index-key
                  key={`x-grid-${tick}-${index}`}
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={0}
                  y2={paneHeight}
                  stroke={gridColor}
                  strokeWidth={1}
                />
              ))}
              {showGrid && ticks.map((tick, index) => {
                const yPos = scale.scale(tick);
                if (!Number.isFinite(yPos)) {
                  return null;
                }
                return (
                  <line
                    // eslint-disable-next-line react/no-array-index-key
                    key={`y-grid-${tick}-${index}`}
                    x1={0}
                    x2={width}
                    y1={yPos}
                    y2={yPos}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
              {pane.guides?.map((guide, idx) => {
                const guideY = scale.scale(guide.y);
                // Support partial-width guides via startTime/endTime
                let x1 = 0;
                let x2 = width;
                if (guide.startTime !== undefined && Number.isFinite(guide.startTime)) {
                  const startX = xScale(guide.startTime);
                  if (Number.isFinite(startX)) {
                    x1 = Math.max(0, startX);
                  }
                }
                if (guide.endTime !== undefined && Number.isFinite(guide.endTime)) {
                  const endX = xScale(guide.endTime);
                  if (Number.isFinite(endX)) {
                    x2 = Math.min(width, endX);
                  }
                }
                // Skip if the guide is entirely outside the visible range
                if (x1 >= width || x2 <= 0 || x1 >= x2) {
                  return null;
                }
                return (
                  <g key={`${guide.y}-${idx}`}>
                    <line
                      x1={x1}
                      x2={x2}
                      y1={guideY}
                      y2={guideY}
                      stroke={guide.color ?? gridColor}
                      strokeDasharray={guide.dashed ? '4 4' : undefined}
                    />
                    {guide.label && (
                      <text
                        x={x1 + 12}
                        y={guideY - 4}
                        fill={axisColor}
                        fontSize={11}
                      >
                        {guide.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {pane.series.map(series => (
                <React.Fragment key={series.key}>
                  {renderSeries(series, scale, xScale, width, darkMode, animationState)}
                </React.Fragment>
              ))}
              {/* Annotation Layer - render on price pane only */}
              {pane.id === 'price' && annotations.length > 0 && (
                <AnnotationLayer
                  annotations={annotations}
                  xScale={xScale}
                  yScale={scale}
                  chartWidth={width}
                  paneHeight={paneHeight}
                  darkMode={darkMode}
                  selectedAnnotationId={selectedAnnotationId}
                  onAnnotationSelect={onAnnotationSelect}
                  onAnnotationMove={onAnnotationMove}
                  onAnnotationTextEdit={onAnnotationTextEdit}
                  onAnnotationDoubleClick={onAnnotationDoubleClick}
                  timeToIndex={annotationTimeToIndex}
                  indexToTime={annotationIndexToTime}
                  dataLength={compressedTimeData?.indexToRaw.length ?? times.length}
                  compressedTimes={compressedTimeData?.indexToRaw}
                  currentTimeframe={timeframe}
                  animationPhase={animationState?.phase}
                />
              )}
              {hover && hoverInfo && showCrosshairPriceLabel && hoverInfo.lineVisible !== false
                && Number.isFinite(hoverInfo.y ?? NaN) && (() => {
                  const labelWidth = 72;
                  const labelHeight = 18;
                  const halfHeight = labelHeight / 2;
                  const xRightPadding = 4;
                  const x = Math.max(0, width - labelWidth - xRightPadding);
                  const rawCenterY = hoverInfo.y as number;
                  const clampedCenterY = Math.max(
                    halfHeight + 2,
                    Math.min(paneHeight - halfHeight - 2, rawCenterY),
                  );
                  const yTop = clampedCenterY - halfHeight;
                  const priceAtPointer = scale.invert(clampedCenterY);
                  if (!Number.isFinite(priceAtPointer)) {
                    return null;
                  }
                  const labelText = formatNumber(priceAtPointer as number);
                  return (
                    <g className="dwlf-crosshair-price-label">
                      <rect
                        x={x}
                        y={yTop}
                        width={labelWidth}
                        height={labelHeight}
                        rx={4}
                        ry={4}
                        fill={tooltipBackground}
                        stroke={crosshairColor}
                        strokeWidth={1}
                      />
                      <text
                        x={x + labelWidth / 2}
                        y={clampedCenterY}
                        fill={textColor}
                        fontSize={11}
                        textAnchor="middle"
                        alignmentBaseline="middle"
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                })()}
              {hoverInfo && hoverInfo.lineVisible !== false && Number.isFinite(hoverInfo.y ?? NaN) && (
                <line
                  x1={0}
                  x2={width}
                  y1={hoverInfo.y as number}
                  y2={hoverInfo.y as number}
                  stroke={crosshairColor}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              )}
              <g className="dwlf-y-axis" transform={`translate(${width - 40}, 0)`}>
                {ticks.map((tick, index) => (
                  <text
                    key={`${tick}-${index}`}
                    x={0}
                    y={scale.scale(tick)}
                    fill={axisColor}
                    fontSize={11}
                    alignmentBaseline="middle"
                  >
                    {formatNumber(tick)}
                  </text>
                ))}
              </g>
              {pane.title && (
                <text x={12} y={14} fill={textColor} fontSize={12} fontWeight={600}>
                  {pane.title}
                </text>
              )}
            </g>
          );
        })}
        {hover && (
          <g className="dwlf-crosshair">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={0}
              y2={resolvedHeight}
              stroke={crosshairColor}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          </g>
        )}
        <g className="dwlf-x-axis">
          {xTicks.map(tick => (
            <text
              key={`tick-${tick}`}
              x={xScale(tick)}
              y={resolvedHeight - 6}
              fill={axisColor}
              fontSize={10}
              textAnchor="middle"
            >
              {formatTime(getRawTimeFromValue(tick), specForRender.timeFormatter)}
            </text>
          ))}
        </g>
      </svg>
      {hover && paneRects.map(({ pane, y, height: paneHeight }) => {
        const info = hover.perPane[pane.id];
        if (!info) return null;
        return (
          <div
            key={`tooltip-${pane.id}`}
            className="dwlf-pane-tooltip"
            style={{
              top: y,
              left: 0,
              color: textColor,
              borderColor: gridColor,
              backgroundColor: tooltipBackground,
              width: '100%',
            }}
          >
            <div className="dwlf-pane-tooltip__title">
              {pane.title ?? 'Pane'} · {formatTime(hover.time, specForRender.timeFormatter)}
            </div>
            <div className="dwlf-pane-tooltip__content">
              {info.series.map(series => (
                <div key={series.key} className="dwlf-pane-tooltip__row">
                  <span style={{ color: series.color ?? textColor }}>{series.key}</span>
                  <span>{series.display}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export { computeSeriesHover as __computeSeriesHoverForTests };
export type { DwlfChartHandle, DWLFChartProps };
export default DWLFChart;
