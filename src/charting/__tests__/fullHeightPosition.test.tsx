import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart, __computeSeriesHoverForTests } from '../../components';
import type { ChartSpec, PaneSpec } from '../types';
import { resolvePaneDomain } from '../scales';

vi.mock('../../hooks/useContainerSize', () => ({
  default: () => [{ current: null }, { width: 800, height: 400 }],
}));

// A full-height position is a time band (a cycle window, a regime span): it spans whatever the price axis
// resolves to and never widens it, so an overlay that stretches the axis cannot leave a gap above or below it.
const T0 = Date.UTC(2024, 0, 1);
const DAY = 86400000;
const candles = Array.from({ length: 10 }, (_, i) => ({ t: T0 + i * DAY, o: 100, h: 110, l: 90, c: 105 }));
const pane = (series: PaneSpec['series']): PaneSpec => ({ id: 'price', heightRatio: 1, yScale: { mode: 'auto' }, series });
const band = { key: 'window', type: 'position' as const, data: [{ start: T0 + 2 * DAY, end: T0 + 5 * DAY, fullHeight: true, rewardColor: 'rgba(1, 2, 3, 0.2)' }] };
const zone = { key: 'zone', type: 'position' as const, data: [{ start: T0 + 2 * DAY, end: T0 + 5 * DAY, entry: 140, stop: 130, target: 150 }] };

describe('full-height position', () => {
  it('does not widen the price axis; a priced box beside it still does', () => {
    const candlesOnly = resolvePaneDomain(pane([{ key: 'p', type: 'ohlc', data: candles }]), { includeOverlaysInAutoScale: true });
    const withBand = resolvePaneDomain(pane([{ key: 'p', type: 'ohlc', data: candles }, band]), { includeOverlaysInAutoScale: true });
    expect(withBand).toEqual(candlesOnly);
    const withZone = resolvePaneDomain(pane([{ key: 'p', type: 'ohlc', data: candles }, band, zone]), { includeOverlaysInAutoScale: true });
    expect(withZone[1]).toBeGreaterThan(candlesOnly[1]);
  });

  it('draws one rectangle over the whole pane, with no prices', () => {
    const spec: ChartSpec = { includeOverlaysInAutoScale: true, panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, band, zone])] };
    const markup = renderToStaticMarkup(<DWLFChart spec={spec} />);
    const overlays = markup.split('class="position-overlay"').slice(1);
    expect(overlays).toHaveLength(2);
    const bandRects = [...overlays[0].matchAll(/<rect [^>]*>/g)].map((m) => m[0]);
    expect(bandRects).toHaveLength(1);
    expect(bandRects[0]).toContain('fill="rgba(1, 2, 3, 0.2)"');
    const y = Number(/ y="([-\d.]+)"/.exec(bandRects[0])?.[1]);
    const h = Number(/ height="([-\d.]+)"/.exec(bandRects[0])?.[1]);
    // the priced zone's rectangles sit inside the band's vertical span
    const zoneRects = [...overlays[1].matchAll(/<rect [^>]*>/g)].map((m) => m[0]);
    expect(zoneRects).toHaveLength(2);
    for (const r of zoneRects) {
      const zy = Number(/ y="([-\d.]+)"/.exec(r)?.[1]);
      const zh = Number(/ height="([-\d.]+)"/.exec(r)?.[1]);
      expect(zy).toBeGreaterThanOrEqual(y);
      expect(zy + zh).toBeLessThanOrEqual(y + h + 1e-6);
    }
    expect(h).toBeGreaterThan(0);
    // the band's span is the pane's, not the prices': a far higher priced box moves the axis, not the band
    const tall = { ...zone, data: [{ ...zone.data[0], entry: 900, stop: 850, target: 1000 }] };
    const other = renderToStaticMarkup(<DWLFChart spec={{ ...spec, panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, band, tall])] }} />);
    const otherBand = /<rect [^>]*fill="rgba\(1, 2, 3, 0.2\)"[^>]*>/.exec(other)?.[0] as string;
    expect(Number(/ y="([-\d.]+)"/.exec(otherBand)?.[1])).toBe(y);
    expect(Number(/ height="([-\d.]+)"/.exec(otherBand)?.[1])).toBe(h);
  });
});

describe('full-height area', () => {
  const area = { key: 'stage', type: 'area' as const, data: [{ t: T0 + 2 * DAY, v: 100 }, { t: T0 + 5 * DAY, v: 100 }], style: { color: '#22c55e', fullHeight: true } };

  it('does not take part in the price axis', () => {
    const candlesOnly = resolvePaneDomain(pane([{ key: 'p', type: 'ohlc', data: candles }]), { includeOverlaysInAutoScale: true });
    const tall = { ...area, data: [{ t: T0 + 2 * DAY, v: 1000 }, { t: T0 + 5 * DAY, v: 1000 }] };
    expect(resolvePaneDomain(pane([{ key: 'p', type: 'ohlc', data: candles }, tall]), { includeOverlaysInAutoScale: true })).toEqual(candlesOnly);
  });

  it('fills from the pane bottom to the pane top, whatever its points say', () => {
    const at = (v: number) => renderToStaticMarkup(<DWLFChart spec={{ panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, { ...area, style: { ...area.style, color: '#123456' }, data: area.data.map((d) => ({ ...d, v })) }])] }} />);
    const pathOf = (markup: string) => /<path d="([^"]+)" fill="#123456"/.exec(markup)?.[1];
    const ys = (d: string) => [...d.matchAll(/[ML,]([-\d.]+),([-\d.]+)/g)].map((m) => Number(m[2]));
    const filled = pathOf(at(100));
    expect(filled).toBeTruthy();
    expect(pathOf(at(95))).toBe(filled);
    // the fill spans exactly what a full-height box spans: the pane, top to bottom
    const markup = renderToStaticMarkup(<DWLFChart spec={{ panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, band, { ...area, style: { ...area.style, color: '#123456' } }])] }} />);
    const rect = /<rect [^>]*fill="rgba\(1, 2, 3, 0.2\)"[^>]*>/.exec(markup)?.[0] as string;
    const top = Number(/ y="([-\d.]+)"/.exec(rect)?.[1]);
    const height = Number(/ height="([-\d.]+)"/.exec(rect)?.[1]);
    const areaYs = ys(pathOf(markup) as string);
    expect(Math.min(...areaYs)).toBeCloseTo(top, 6);
    expect(Math.max(...areaYs)).toBeCloseTo(top + height, 6);
  });

  it('a non-finite point still breaks the fill between spans', () => {
    const spans = { ...area, style: { ...area.style, color: '#123456' }, data: [{ t: T0, v: 0 }, { t: T0 + DAY, v: 0 }, { t: T0 + 2 * DAY, v: Number.NaN }, { t: T0 + 3 * DAY, v: 0 }, { t: T0 + 4 * DAY, v: 0 }] };
    const d = /<path d="([^"]+)" fill="#123456"/.exec(renderToStaticMarkup(<DWLFChart spec={{ panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, spans])] }} />))?.[1];
    expect(d?.match(/M/g)?.length).toBe(2);
  });

  it('gives no hover value', () => {
    expect(__computeSeriesHoverForTests(area, T0 + 3 * DAY)).toMatchObject({ value: null, raw: null, display: '—' });
    expect(__computeSeriesHoverForTests({ ...area, tooltipFormatter: () => 'Stage 2' }, T0 + 3 * DAY)).toMatchObject({ value: null, display: 'Stage 2' });
  });
});

describe('series-wide fullHeight on positions', () => {
  const styled = { key: 'windows', type: 'position' as const, style: { fullHeight: true }, data: [{ start: T0 + 2 * DAY, end: T0 + 5 * DAY }, { start: T0 + 6 * DAY, end: T0 + 8 * DAY, fullHeight: false, entry: 140, stop: 130, target: 150 }] };

  it('style.fullHeight is the default; a datum can opt out', () => {
    const spec: ChartSpec = { includeOverlaysInAutoScale: true, panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, styled])] };
    const overlays = renderToStaticMarkup(<DWLFChart spec={spec} />).split('class="position-overlay"').slice(1);
    expect(overlays.map((o) => [...o.matchAll(/<rect [^>]*>/g)].length)).toEqual([1, 2]);
    // the opted-out box's prices still widen the axis
    const candlesOnly = resolvePaneDomain(pane([{ key: 'p', type: 'ohlc', data: candles }]), { includeOverlaysInAutoScale: true });
    expect(resolvePaneDomain(spec.panes[0], { includeOverlaysInAutoScale: true })[1]).toBeGreaterThan(candlesOnly[1]);
  });
});

describe('full-height area in a zoomed view', () => {
  it('keeps the band when the view sits inside it, or holds one edge', async () => {
    const { __filterSeriesDataForRangeForTests: filter } = await import('../../components/DWLFChart');
    const area = { key: 'stage', type: 'area' as const, style: { fullHeight: true }, data: [{ t: T0, v: 0 }, { t: T0 + 9 * DAY, v: 0 }] };
    expect(filter(area, T0 + 3 * DAY, T0 + 5 * DAY, DAY)).toHaveLength(2);
    expect(filter(area, T0 + 8 * DAY, T0 + 12 * DAY, DAY)).toHaveLength(2);
    expect(filter(area, T0 + 11 * DAY, T0 + 12 * DAY, DAY)).toHaveLength(0);
  });
});

describe('a band with an edge off the bars, gaps compressed and panning on', () => {
  it('is drawn across the plot, not dropped or a trillion pixels wide', () => {
    const offEdges = { key: 'w', type: 'position' as const, data: [{ start: T0 - 5 * DAY, end: T0 + 3 * DAY, fullHeight: true, rewardColor: 'rgba(4, 5, 6, 0.2)' }, { start: T0 + 7 * DAY, end: T0 + 30 * DAY, fullHeight: true, rewardColor: 'rgba(7, 8, 9, 0.2)' }] };
    const markup = renderToStaticMarkup(<DWLFChart spec={{ panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, offEdges])] }} enablePanZoom compressGaps />);
    for (const fill of ['rgba(4, 5, 6, 0.2)', 'rgba(7, 8, 9, 0.2)']) {
      const rect = [...markup.matchAll(/<rect [^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`fill="${fill}"`));
      expect(rect, fill).toBeTruthy();
      const width = Number(/ width="([-\d.e+]+)"/.exec(rect as string)?.[1]);
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThan(10_000);
    }
  });
});

describe('full-height position hover', () => {
  it('gives no price value, even for a datum that carries prices', () => {
    const series = { key: 'w', type: 'position' as const, style: { fullHeight: true }, data: [{ start: T0, end: T0 + 3 * DAY, entry: 500, stop: 400, target: 600 }] };
    expect(__computeSeriesHoverForTests(series, T0 + DAY)).toMatchObject({ value: null, display: '—' });
    expect(__computeSeriesHoverForTests({ ...series, style: {} }, T0 + DAY)).toMatchObject({ value: 500 });
  });
});

describe('remapPositionDatum (gaps compressed)', () => {
  it('maps edges and message times off the bars to fractional or off-screen indices, never raw timestamps', async () => {
    const { __remapPositionDatumForTests: remap } = await import('../../components/DWLFChart');
    const indexToRaw = [T0, T0 + DAY, T0 + 2 * DAY];
    const data = { rawToIndex: new Map(indexToRaw.map((t, i) => [t, i])), indexToRaw };
    const out = remap({ start: T0 - 5 * DAY, end: T0 + 9 * DAY, messages: [{ t: T0 - 5 * DAY, v: 1, text: 'a' }, { t: T0 + DAY, v: 1, text: 'b' }] }, data);
    for (const x of [out.start, out.end, ...out.messages.map((m: { t: number }) => m.t)]) {
      expect(Math.abs(x)).toBeLessThan(100);
    }
    expect(out.messages[1].t).toBe(1);
    expect(out.messages[0].__rawTime).toBe(T0 - 5 * DAY);
  });
});
