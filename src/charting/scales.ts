import * as d3 from 'd3';
import type { ChartSpec, LinePoint, OhlcPoint, PaneComputedScale, PaneSpec, SeriesSpec } from './types';

const DEFAULT_DOMAIN: [number, number] = [0, 1];
const DOMAIN_PADDING_RATIO = 0.15; // 15% vertical breathing room to avoid clipping markers/labels

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);

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
  return sample
    && typeof sample.t === 'number'
    && typeof sample.o === 'number'
    && typeof sample.h === 'number'
    && typeof sample.l === 'number'
    && typeof sample.c === 'number';
};

const collectSeriesValues = (series: SeriesSpec): number[] => {
  const data = series.data ?? [];
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  if (series.type === 'ohlc' && isOhlcArray(data)) {
    const lows = data.map(point => point.l).filter(isFiniteNumber);
    const highs = data.map(point => point.h).filter(isFiniteNumber);
    return [...lows, ...highs];
  }

  if (isLinePointArray(data)) {
    const values = data.map(point => point.v).filter(isFiniteNumber);
    if (series.type === 'hist') {
      return [...values, 0];
    }
    return values;
  }

  if (series.type === 'marker') {
    return (data as Array<Record<string, unknown>>)
      .map(item => (item && typeof item === 'object' ? Number((item as any).v) : Number.NaN))
      .filter(isFiniteNumber);
  }

  if (series.type === 'position') {
    return (data as Array<Record<string, unknown>>)
      .flatMap(item => {
        if (!item || typeof item !== 'object') {
          return [] as number[];
        }
        const entry = Number((item as any).entry);
        const stop = Number((item as any).stop);
        const target = Number((item as any).target);
        return [entry, stop, target];
      })
      .filter(isFiniteNumber);
  }

  // Fallback: attempt to read numeric values if present
  const numericValues = (data as Array<Record<string, unknown>>)
    .flatMap(item => Object.values(item ?? {}))
    .filter(isFiniteNumber);

  return series.type === 'hist' ? [...numericValues, 0] : numericValues;
};

const shouldIncludeSeriesInAutoScale = (
  series: SeriesSpec,
  includeOverlays: boolean,
  hasOhlcSeries: boolean,
): boolean => {
  if (series.type === 'ohlc') {
    return true;
  }
  if (!hasOhlcSeries) {
    return true;
  }
  return includeOverlays;
};

const resolveAutoDomain = (
  pane: PaneSpec,
  includeOverlaysInAutoScale: boolean,
): [number, number] => {
  const extents: Array<[number, number]> = [];

  const hasOhlcSeries = pane.series.some(series => series.type === 'ohlc');
  const seriesForDomain = pane.series.filter(series => (
    shouldIncludeSeriesInAutoScale(series, includeOverlaysInAutoScale, hasOhlcSeries)
  ));

  seriesForDomain.forEach(series => {
    const values = collectSeriesValues(series);
    if (!values.length) return;
    const min = d3.min(values);
    const max = d3.max(values);
    if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
      return;
    }
    extents.push([min, max]);
  });

  if (!extents.length) {
    return DEFAULT_DOMAIN;
  }

  const min = d3.min(extents.map(([value]) => value));
  const max = d3.max(extents.map(([, value]) => value));

  if (!isFiniteNumber(min) || !isFiniteNumber(max) || min === max) {
    const center = isFiniteNumber(min) ? min : 0;
    return [center - 1, center + 1];
  }

  const range = max - min;
  const padding = range * DOMAIN_PADDING_RATIO;
  const paddedMin = min - padding;
  const paddedMax = max + padding;

  if (!Number.isFinite(paddedMin) || !Number.isFinite(paddedMax)) {
    return [min, max];
  }

  return [paddedMin, paddedMax];
};

export type ResolvePaneDomainOptions = {
  includeOverlaysInAutoScale?: boolean;
};

export const resolvePaneDomain = (
  pane: PaneSpec,
  options: ResolvePaneDomainOptions = {},
): [number, number] => {
  const includeOverlaysInAutoScale = options.includeOverlaysInAutoScale ?? false;
  if (pane.yScale.mode === 'fixed') {
    const min = isFiniteNumber(pane.yScale.min) ? pane.yScale.min as number : 0;
    const max = isFiniteNumber(pane.yScale.max) ? pane.yScale.max as number : 1;
    if (min === max) {
      return [min - 1, max + 1];
    }
    return [min, max];
  }

  return resolveAutoDomain(pane, includeOverlaysInAutoScale);
};

export const createPaneScale = (domain: [number, number], height: number): PaneComputedScale => {
  const scale = d3.scaleLinear().domain(domain).range([height, 0]);
  const fn = (value: number) => scale(value);
  const invert = (value: number) => scale.invert(value);
  return { domain, scale: fn, invert };
};

export type BuildPaneScalesOptions = {
  includeOverlaysInAutoScale?: boolean;
};

export const buildPaneScales = (
  spec: ChartSpec,
  paneHeights: Record<string, number>,
  options: BuildPaneScalesOptions = {},
): Record<string, PaneComputedScale> => {
  const includeOverlaysInAutoScale = options.includeOverlaysInAutoScale
    ?? spec.includeOverlaysInAutoScale
    ?? false;
  const result: Record<string, PaneComputedScale> = {};
  spec.panes.forEach(pane => {
    const height = paneHeights[pane.id] ?? 0;
    result[pane.id] = createPaneScale(
      resolvePaneDomain(pane, { includeOverlaysInAutoScale }),
      height,
    );
  });
  return result;
};

const collectSeriesTimes = (series: SeriesSpec): number[] => {
  const data = series.data ?? [];
  if (!Array.isArray(data)) return [];

  if (isOhlcArray(data)) {
    return data.map(point => point.t).filter(isFiniteNumber);
  }
  if (isLinePointArray(data)) {
    return data.map(point => point.t).filter(isFiniteNumber);
  }

  if (series.type === 'marker') {
    return (data as Array<Record<string, unknown>>)
      .map(item => (item && typeof item === 'object' ? Number((item as any).t) : Number.NaN))
      .filter(isFiniteNumber);
  }

  if (series.type === 'position') {
    return (data as Array<Record<string, unknown>>)
      .flatMap(item => {
        if (!item || typeof item !== 'object') {
          return [] as number[];
        }
        const start = Number((item as any).start);
        const end = Number((item as any).end);
        const values: number[] = [];
        if (Number.isFinite(start)) values.push(start);
        if (Number.isFinite(end)) values.push(end);
        return values;
      })
      .filter(isFiniteNumber);
  }

  return data
    .map((item: any) => (item && typeof item.t === 'number' ? item.t : undefined))
    .filter(isFiniteNumber);
};

export const collectPaneTimes = (pane: PaneSpec): number[] => {
  const result: number[] = [];
  pane.series.forEach(series => {
    result.push(...collectSeriesTimes(series));
  });
  return result;
};

export const collectSpecTimes = (spec: ChartSpec): number[] => {
  const unique = new Set<number>();
  spec.panes.forEach(pane => {
    collectPaneTimes(pane).forEach(time => unique.add(time));
  });
  return Array.from(unique).sort((a, b) => a - b);
};

export const findClosestTime = (times: number[], value: number): number => {
  if (!times.length) return Number.NaN;
  let low = 0;
  let high = times.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = times[mid];
    if (current === value) {
      return current;
    }
    if (current < value) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const before = times[Math.max(0, high)];
  const after = times[Math.min(times.length - 1, low)];
  return Math.abs(before - value) <= Math.abs(after - value) ? before : after;
};

/**
 * Map a raw timestamp to a fractional index in a sorted `times` array.
 * Exact matches return the integer index. Timestamps between two candles
 * return a local fractional index. Timestamps outside the array are
 * extrapolated from the first/last pair.
 *
 * Returns `undefined` only when the array has fewer than 2 elements (or
 * zero-width adjacent times), leaving the fallback strategy up to the
 * caller. This is the shared kernel behind both compressed line-series
 * remapping and annotation extrapolation, so line series and user-drawn
 * annotations agree on positioning.
 */
export const resolveFractionalIndex = (
  times: number[],
  value: number,
): number | undefined => {
  if (!times || times.length === 0) return undefined;
  let lo = 0;
  let hi = times.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < value) lo = mid + 1;
    else if (times[mid] > value) hi = mid - 1;
    else return mid;
  }
  if (times.length < 2) return undefined;
  if (hi < 0) {
    const dt = times[1] - times[0];
    return dt ? (value - times[0]) / dt : undefined;
  }
  if (lo >= times.length) {
    const lastIdx = times.length - 1;
    const dt = times[lastIdx] - times[lastIdx - 1];
    return dt ? lastIdx + (value - times[lastIdx]) / dt : undefined;
  }
  const dt = times[lo] - times[hi];
  return dt ? hi + (value - times[hi]) / dt : hi;
};

export type { LinePoint, OhlcPoint, PaneSpec, SeriesSpec };
