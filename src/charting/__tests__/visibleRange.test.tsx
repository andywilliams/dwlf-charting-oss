import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart } from '../../components';
import type { ChartSpec } from '../types';

const WEEK = 7 * 86_400_000;
const t0 = Date.UTC(2026, 0, 5);
const bars = Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * WEEK, o: 100 + i * 10, h: 110 + i * 10, l: 90 + i * 10, c: 105 + i * 10 }));
const spec: ChartSpec = { panes: [{ id: 'price', heightRatio: 1, yScale: { mode: 'auto' }, series: [{ key: 'price', type: 'ohlc', data: bars }] }] };

/** One wick per drawn candle: the first path in the candle group is the wicks, one `M` each. */
const candleCount = (markup: string) => (markup.match(/<g class="dwlf-candles"><path d="([^"]*)"/)?.[1].match(/M/g) ?? []).length;
const yLabels = (markup: string) => [...markup.matchAll(/alignment-baseline="middle">([^<]+)</g)].map(m => Number(m[1]));

describe('DWLFChart visibleRange', () => {
  it('draws only the bars inside the host-set range, with one bar either side', () => {
    expect(candleCount(renderToStaticMarkup(<DWLFChart spec={spec} timeframe="weekly" />))).toBe(12);
    const ranged = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="weekly" visibleRange={{ from: bars[3].t, to: bars[5].t }} />);
    expect(candleCount(ranged)).toBe(5);
  });

  it('scales the price axis to the bars in range', () => {
    const ranged = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="weekly" visibleRange={{ from: bars[3].t, to: bars[5].t }} />);
    // Bars 2..6 span 110..170; nothing from the rest of the series (90..220) widens the axis.
    expect(Math.min(...yLabels(ranged))).toBeGreaterThanOrEqual(100);
    expect(Math.max(...yLabels(ranged))).toBeLessThanOrEqual(180);
  });

  it('can reach past the last bar into the blank slots', () => {
    const last = bars[bars.length - 1].t;
    const ranged = renderToStaticMarkup(<DWLFChart spec={spec} timeframe="weekly" visibleRange={{ from: bars[9].t, to: last + 6 * WEEK }} />);
    // Bars 9..11, plus bar 8 as the one-bar margin before the range.
    expect(candleCount(ranged)).toBe(4);
  });
});
