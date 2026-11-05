import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart } from '../../components';
import { buildPaneScales, createPaneScale, logTicks, resolvePaneDomain } from '../scales';
import type { ChartSpec, PaneSpec } from '../types';

const HEIGHT = 300;
vi.mock('../../hooks/useContainerSize', () => ({ default: () => [{ current: null }, { width: 600, height: HEIGHT }] }));

const DAY = 86_400_000;
const t0 = Date.UTC(2015, 0, 22);
// 200 -> 120,000 over 1,000 bars, geometric: about 2.8 decades, like BTC 2015 -> 2026.
const bars = Array.from({ length: 1000 }, (_, i) => {
  const c = 200 * (600 ** (i / 999));
  return { t: t0 + i * DAY, o: c, h: c * 1.01, l: c * 0.99, c };
});
const pricePane = (type?: 'linear' | 'log'): PaneSpec => ({
  id: 'price', heightRatio: 1, yScale: { mode: 'auto', ...(type ? { type } : {}) },
  series: [{ key: 'p', type: 'ohlc', data: bars }],
});

describe('log price scale', () => {
  it('pads the auto domain by the same share of decades at each end', () => {
    const [lo, hi] = resolvePaneDomain(pricePane('log'));
    const [dataLo, dataHi] = [Math.log10(200 * 0.99), Math.log10(120_000 * 1.01)];
    const pad = (dataHi - dataLo) * 0.15;
    expect(Math.log10(lo)).toBeCloseTo(dataLo - pad, 6);
    expect(Math.log10(hi)).toBeCloseTo(dataHi + pad, 6);
    expect(lo).toBeGreaterThan(0);
  });

  it('keeps linear as the default (unchanged domain)', () => {
    const [lo] = resolvePaneDomain(pricePane());
    expect(lo).toBeLessThan(0); // linear padding goes below zero on this range; log never does
    expect(buildPaneScales({ panes: [pricePane()] }, { price: HEIGHT }).price.type).toBe('linear');
  });

  it('maps equal ratios to equal distances and inverts', () => {
    const s = createPaneScale([100, 100_000], HEIGHT, 'log');
    expect(s.type).toBe('log');
    const d1 = s.scale(100) - s.scale(1_000);
    const d2 = s.scale(10_000) - s.scale(100_000);
    expect(d1).toBeCloseTo(d2, 6);
    expect(s.invert(s.scale(12_345))).toBeCloseTo(12_345, 4);
  });

  it('clamps non-positive values to the floor instead of NaN', () => {
    const s = createPaneScale([100, 100_000], HEIGHT, 'log');
    expect(s.scale(0)).toBe(s.scale(100));
    expect(s.scale(-5)).toBe(s.scale(100));
  });

  it('keeps a non-finite value NaN, as on the linear path', () => {
    const s = createPaneScale([100, 100_000], HEIGHT, 'log');
    expect(Number.isNaN(s.scale(Number.NaN))).toBe(true);
    expect(Number.isNaN(s.scale(undefined as unknown as number))).toBe(true);
  });

  it('falls back to linear on a fixed domain with a bound <= 0 (unset min counts as 0)', () => {
    const pane: PaneSpec = { id: 'f', heightRatio: 1, yScale: { mode: 'fixed', max: 1000, type: 'log' }, series: [] };
    expect(buildPaneScales({ panes: [pane] }, { f: HEIGHT }).f.type).toBe('linear');
  });

  it('labels sub-cent log ticks with significant digits, not "0.00"', () => {
    const tiny = Array.from({ length: 200 }, (_, i) => {
      const c = 0.001 * (10_000 ** (i / 199));
      return { t: t0 + i * DAY, o: c, h: c, l: c, c };
    });
    const spec: ChartSpec = { panes: [{ id: 'p', heightRatio: 1, yScale: { mode: 'auto', type: 'log' }, series: [{ key: 'p', type: 'ohlc', data: tiny }] }] };
    const markup = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="1d" />);
    const axis = markup.match(/<g class="dwlf-y-axis"[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    const labels = [...axis.matchAll(/>([^<]+)<\/text>/g)].map(m => m[1]);
    expect(labels).not.toContain('0.00');
    expect(labels.some(l => Number(l) > 0 && Number(l) < 0.01)).toBe(true);
  });

  it('keeps neighbouring sub-cent ticks distinct on a log pane under one decade', () => {
    const quiet = Array.from({ length: 200 }, (_, i) => {
      const c = 0.005005 + (0.00004 * i) / 199;
      return { t: t0 + i * DAY, o: c, h: c, l: c, c };
    });
    const spec: ChartSpec = { panes: [{ id: 'q', heightRatio: 1, yScale: { mode: 'auto', type: 'log' }, series: [{ key: 'q', type: 'ohlc', data: quiet }] }] };
    const markup = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="1d" />);
    const axis = markup.match(/<g class="dwlf-y-axis"[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    const labels = [...axis.matchAll(/>([^<]+)<\/text>/g)].map(m => m[1]);
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('ignores a hist series 0 base when placing a log domain', () => {
    const pane: PaneSpec = { id: 'v', heightRatio: 1, yScale: { mode: 'auto', type: 'log' },
      series: [{ key: 'h', type: 'hist', data: [{ t: 1, v: 10 }, { t: 2, v: 1000 }] }] };
    const [lo] = resolvePaneDomain(pane);
    expect(lo).toBeGreaterThan(0);
  });

  it('falls back to linear when nothing is positive', () => {
    const pane: PaneSpec = { id: 'z', heightRatio: 1, yScale: { mode: 'fixed', min: -1, max: 1, type: 'log' }, series: [] };
    expect(buildPaneScales({ panes: [pane] }, { z: HEIGHT }).z.type).toBe('linear');
  });

  it('ticks: 1-2-5 per decade, thinned to decades over a wide span, linear under a decade', () => {
    expect(logTicks([150, 2_000], 4)).toEqual([200, 500, 1000, 2000]);
    expect(logTicks([150, 160_000], 4)).toEqual([1000, 10000, 100000]);
    const narrow = logTicks([60_000, 90_000], 4);
    expect(narrow.length).toBeGreaterThan(1);
    narrow.forEach(v => { expect(v).toBeGreaterThanOrEqual(60_000); expect(v).toBeLessThanOrEqual(90_000); });
  });

  it('draws round log labels on the price axis', () => {
    const spec: ChartSpec = { panes: [pricePane('log')] };
    const markup = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="1d" />);
    const axis = markup.match(/<g class="dwlf-y-axis"[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    const labels = [...axis.matchAll(/>([^<]+)<\/text>/g)].map(m => Number(m[1].replace(/,/g, '')));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    labels.forEach(v => expect(Math.log10(v) % 1).toBeCloseTo(0, 6));
  });
});
