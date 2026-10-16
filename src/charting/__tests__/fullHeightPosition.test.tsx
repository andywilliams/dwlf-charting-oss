import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart } from '../../components';
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
    const at = (v: number) => renderToStaticMarkup(<DWLFChart spec={{ panes: [pane([{ key: 'p', type: 'ohlc', data: candles }, { ...area, data: area.data.map((d) => ({ ...d, v })) }])] }} />);
    const pathOf = (markup: string) => /<path d="([^"]+)" fill="#22c55e"/.exec(markup)?.[1];
    expect(pathOf(at(100))).toBeTruthy();
    expect(pathOf(at(100))).toBe(pathOf(at(95)));
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
