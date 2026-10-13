import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart } from '../../components';
import type { ChartSpec } from '../types';

// Server rendering never measures the container; a fixed size lets the axes draw their labels.
const HEIGHT = 300;
vi.mock('../../hooks/useContainerSize', () => ({ default: () => [{ current: null }, { width: 600, height: HEIGHT }] }));

const DAY = 86_400_000;
const t0 = Date.UTC(2025, 7, 4);
// Prices padded (15% of their range each side) to 990-3010: the 1000 and 3000 ticks sit 1.5px from the
// pane's foot and top.
const [low, high] = [990 + 0.15 * (2020 / 1.3), 3010 - 0.15 * (2020 / 1.3)];
const bars = Array.from({ length: 100 }, (_, i) => {
  const c = low + ((high - low) * i) / 99;
  return { t: t0 + i * DAY, o: c, h: c, l: c, c };
});

describe('DWLFChart price axis', () => {
  it('draws no price label cut off at the top or on the time-axis labels at the foot', () => {
    const spec: ChartSpec = { panes: [{ id: 'price', heightRatio: 1, yScale: { mode: 'auto' }, series: [{ key: 'price', type: 'ohlc', data: bars }] }] };
    const markup = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="1d" />);
    const axis = markup.match(/<g class="dwlf-y-axis"[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    const ys = [...axis.matchAll(/<text x="0" y="([^"]+)"/g)].map(m => Number(m[1]));
    expect(ys.length).toBeGreaterThan(1);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(6);
      expect(y).toBeLessThanOrEqual(HEIGHT - 6 - 15);
    }
  });

  it('keeps a label near the foot of an upper pane, and leaves it out only where the time axis is', () => {
    // Two equal panes fixed at -5 to 95: the 0 tick sits 5% of a pane's height (about 7px) above its foot.
    const pane = (id: string) => ({
      id,
      heightRatio: 1,
      yScale: { mode: 'fixed' as const, min: -5, max: 95 },
      series: [{ key: id, type: 'line' as const, data: bars.map(b => ({ t: b.t, v: 50 })) }],
    });
    const markup = renderToStaticMarkup(<DWLFChart spec={{ panes: [pane('upper'), pane('lower')] }} timeframe="1d" />);
    const [upper, lower] = [...markup.matchAll(/<g class="dwlf-y-axis"[^>]*>(.*?)<\/g>/g)].map(m => [...m[1].matchAll(/>([^<]+)<\/text>/g)].map(t => t[1]));
    expect(upper).toContain('0.00');
    expect(lower).not.toContain('0.00');
    expect(lower).toContain('20.00');
  });
});
