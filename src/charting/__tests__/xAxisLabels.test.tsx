import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart } from '../../components';
import type { ChartSpec } from '../types';

// Server rendering never measures the container; a fixed size lets the x-axis draw its labels.
const PLOT_WIDTH = 600;
vi.mock('../../hooks/useContainerSize', () => ({ default: () => [{ current: null }, { width: PLOT_WIDTH, height: 300 }] }));

const DAY = 86_400_000;
const t0 = Date.UTC(2025, 7, 4);
// Ends a week after 1 Apr, so that tick's 16-character label would run past the right edge.
const bars = Array.from({ length: 247 }, (_, i) => ({ t: t0 + i * DAY, o: 100, h: 110, l: 90, c: 105 }));

describe('DWLFChart time axis', () => {
  it('draws every tick label whole inside the plot, none overlapping', () => {
    const format = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
    const spec: ChartSpec = { panes: [{ id: 'price', heightRatio: 1, yScale: { mode: 'auto' }, series: [{ key: 'price', type: 'ohlc', data: bars }] }], timeFormatter: format };
    const markup = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="1d" />);
    const axis = markup.match(/<g class="dwlf-x-axis">(.*?)<\/g>/)?.[1] ?? '';
    const labels = [...axis.matchAll(/<text x="([^"]+)"[^>]*>([^<]+)</g)].map(m => ({ x: Number(m[1]), half: (m[2].length * 6) / 2 }));
    expect(labels.length).toBeGreaterThan(1);
    for (const l of labels) {
      expect(l.x - l.half).toBeGreaterThanOrEqual(0);
      expect(l.x + l.half).toBeLessThanOrEqual(PLOT_WIDTH);
    }
    for (let i = 1; i < labels.length; i++) expect(labels[i].x - labels[i - 1].x).toBeGreaterThanOrEqual(labels[i].half + labels[i - 1].half);
  });
});
