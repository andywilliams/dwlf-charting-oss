import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DWLFChart, __computeSeriesHoverForTests } from '../../components';
import type { ChartSpec, PaneSpec, SeriesSpec } from '../types';
import { collectSpecTimes, findClosestTime, resolvePaneDomain } from '../scales';

type TestSeries = SeriesSpec;

type TestPane = PaneSpec;

const priceSeries: TestSeries = {
  key: 'price',
  type: 'ohlc',
  data: [
    { t: Date.UTC(2024, 0, 1), o: 100, h: 110, l: 95, c: 105 },
    { t: Date.UTC(2024, 0, 2), o: 105, h: 112, l: 101, c: 107 },
  ],
};

const oscSeries: TestSeries = {
  key: 'osc',
  type: 'line',
  data: [
    { t: Date.UTC(2024, 0, 1), v: 40 },
    { t: Date.UTC(2024, 0, 2), v: 62 },
  ],
  style: { lineWidth: 2 },
};

const chartSpec: ChartSpec = {
  panes: [
    {
      id: 'pane-price',
      title: 'Price',
      heightRatio: 3,
      yScale: { mode: 'auto' },
      series: [priceSeries],
    },
    {
      id: 'pane-osc',
      title: 'Oscillator',
      heightRatio: 1,
      yScale: { mode: 'fixed', min: 0, max: 100 },
      series: [oscSeries],
      guides: [
        { y: 20, dashed: true, label: '20' },
        { y: 80, dashed: true, label: '80' },
      ],
    },
  ],
};

describe('DWLFChart rendering', () => {
  it('renders a multi-pane chart from a ChartSpec snapshot', () => {
    const markup = renderToStaticMarkup(
      <DWLFChart spec={chartSpec} darkMode={false} showGrid={false} />,
    );
    const normalised = markup.replace(
      /-?\d+\.\d+/g,
      (value) => Number.parseFloat(value).toFixed(2),
    );
    expect(normalised).toMatchSnapshot();
  });

  it('omits the y-axis tick labels when pane.hideYAxis is true', () => {
    const specWithHiddenAxis: ChartSpec = {
      panes: [
        {
          id: 'pane-price',
          heightRatio: 3,
          yScale: { mode: 'auto' },
          series: [priceSeries],
        },
        {
          id: 'pane-events',
          heightRatio: 0.5,
          yScale: { mode: 'fixed', min: 0, max: 1 },
          hideYAxis: true,
          series: [],
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <DWLFChart spec={specWithHiddenAxis} darkMode={false} showGrid={false} />,
    );
    // Both panes should still render — we're only suppressing the y-axis
    // text layer. Sanity-check: at least one dwlf-y-axis should exist (for
    // the price pane), confirming the suppression is per-pane, not global.
    const yAxisMatches = (markup.match(/dwlf-y-axis/g) || []).length;
    expect(yAxisMatches).toBe(1);
  });

  it('renders y-axis tick labels for all panes when hideYAxis is not set (regression check)', () => {
    const specWithoutHiddenAxis: ChartSpec = {
      panes: [
        {
          id: 'pane-price',
          heightRatio: 3,
          yScale: { mode: 'auto' },
          series: [priceSeries],
        },
        {
          id: 'pane-osc',
          heightRatio: 1,
          yScale: { mode: 'fixed', min: 0, max: 100 },
          series: [oscSeries],
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <DWLFChart spec={specWithoutHiddenAxis} darkMode={false} showGrid={false} />,
    );
    const yAxisMatches = (markup.match(/dwlf-y-axis/g) || []).length;
    expect(yAxisMatches).toBe(2);
  });
});

describe('crosshair synchronisation', () => {
  it('resolves the same timestamp across panes', () => {
    const times = collectSpecTimes(chartSpec);
    const probeTime = Date.UTC(2024, 0, 1, 12); // mid-way within the first session
    const closest = findClosestTime(times, probeTime);
    expect(closest).toBe(Date.UTC(2024, 0, 1));

    const priceHover = __computeSeriesHoverForTests(priceSeries, closest);
    const oscHover = __computeSeriesHoverForTests(oscSeries, closest);

    expect(priceHover.value).toBe(105);
    expect(oscHover.value).toBe(40);
  });
});

describe('pane scale behaviour', () => {
  it('derives an auto domain from OHLC data', () => {
    const autoPane: TestPane = {
      id: 'auto',
      heightRatio: 1,
      yScale: { mode: 'auto' },
      series: [priceSeries],
    };
    expect(resolvePaneDomain(autoPane)).toEqual([93.64, 113.36]);
  });

  it('honours fixed scale bounds', () => {
    const fixedPane: TestPane = {
      id: 'fixed',
      heightRatio: 1,
      yScale: { mode: 'fixed', min: 0, max: 100 },
      series: [oscSeries],
    };
    expect(resolvePaneDomain(fixedPane)).toEqual([0, 100]);
  });

  it('excludes overlays from auto-scale when OHLC data is present by default', () => {
    const markerSeries: TestSeries = {
      key: 'markers',
      type: 'marker',
      data: [
        { t: Date.UTC(2024, 0, 1), v: 200 },
      ],
    };

    const pane: TestPane = {
      id: 'overlay-default',
      heightRatio: 1,
      yScale: { mode: 'auto' },
      series: [priceSeries, markerSeries],
    };

    expect(resolvePaneDomain(pane)).toEqual([93.64, 113.36]);
  });

  it('includes overlays in auto-scale when explicitly enabled', () => {
    const markerSeries: TestSeries = {
      key: 'markers',
      type: 'marker',
      data: [
        { t: Date.UTC(2024, 0, 1), v: 200 },
      ],
    };

    const pane: TestPane = {
      id: 'overlay-enabled',
      heightRatio: 1,
      yScale: { mode: 'auto' },
      series: [priceSeries, markerSeries],
    };

    expect(resolvePaneDomain(pane, { includeOverlaysInAutoScale: true })).toEqual([86.6, 208.4]);
  });

  it('auto-scales non-OHLC panes even when overlays are excluded', () => {
    const markerSeries: TestSeries = {
      key: 'markers',
      type: 'marker',
      data: [
        { t: Date.UTC(2024, 0, 1), v: 200 },
      ],
    };

    const pane: TestPane = {
      id: 'markers-only',
      heightRatio: 1,
      yScale: { mode: 'auto' },
      series: [markerSeries],
    };

    expect(resolvePaneDomain(pane)).toEqual([199, 201]);
  });
});
