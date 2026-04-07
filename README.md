# @dwlf/charting

React charting library for financial data — candlestick charts, annotations, overlays, and interaction hooks.

Built with D3 and SVG. Zero indicator dependencies — bring your own data.

## Install

```bash
npm install @dwlf/charting
# or
pnpm add @dwlf/charting
```

## Quick Start

```tsx
import { DWLFChart } from '@dwlf/charting';
import '@dwlf/charting/styles';
import type { ChartSpec } from '@dwlf/charting';

const spec: ChartSpec = {
  panes: [
    {
      id: 'price',
      heightRatio: 3,
      yScale: { mode: 'auto' },
      series: [
        {
          key: 'candles',
          type: 'ohlc',
          data: candles, // array of { t, o, h, l, c }
        },
      ],
    },
  ],
};

function MyChart() {
  return <DWLFChart spec={spec} darkMode={true} enablePanZoom={true} />;
}
```

## Dark Mode

Dark mode is supported via the `darkMode` prop (defaults to `true`):

```tsx
<DWLFChart spec={spec} darkMode={true} />
```

This controls the background, text, grid, crosshair, tooltip, and candle colors automatically.

For further customisation, use `axisColors`:

```tsx
<DWLFChart
  spec={spec}
  darkMode={true}
  axisColors={{ dark: '#8b949e', light: '#57606a' }}
/>
```

## Timestamps

**Important:** The charting library expects timestamps in **milliseconds** (Unix epoch in ms). If your data uses seconds (common in crypto APIs), multiply by 1000:

```tsx
const chartData = candles.map(c => ({
  t: c.t * 1000, // seconds → milliseconds
  o: c.o,
  h: c.h,
  l: c.l,
  c: c.c,
}));
```

When pairing with `@dwlf/indicators`, note that indicator output uses the same timestamp format as input. If your source data uses seconds, the indicator output will too — convert when passing to the chart.

## Series Configuration

Each pane contains an array of series. Every series needs a `key` (unique identifier), `type`, and `data`.

### Series Types

| Type | Description | Data format |
|------|-------------|-------------|
| `ohlc` | Candlestick chart | `{ t, o, h, l, c }[]` |
| `line` | Line chart | `{ t, v }[]` |
| `hist` | Histogram bars | `{ t, v }[]` |
| `area` | Filled area | `{ t, v }[]` |
| `marker` | Point markers | `{ t, price, text?, tooltip?, shape? }[]` |
| `position` | Trade positions | `{ t, price, type, stopLoss?, takeProfit? }[]` |

### Series Colors

Set colors with the `color` shorthand or `style.color` (both work):

```tsx
// Shorthand
{ key: 'ema8', type: 'line', data: ema8, color: '#58a6ff' }

// Full style object (takes precedence)
{ key: 'ema8', type: 'line', data: ema8, style: { color: '#58a6ff', lineWidth: 2, dashed: true } }
```

### Style Options

```tsx
interface SeriesStyle {
  color?: string;        // Series color
  lineWidth?: number;    // Line thickness (default: 1.5)
  dashed?: boolean;      // Dashed line
  opacity?: number;      // Opacity (0-1)
  markerShape?: 'arrow-up' | 'arrow-down' | 'circle';
  markerSize?: number;
}
```

## Multi-Pane Layout

Use `heightRatio` to control pane proportions:

```tsx
const spec: ChartSpec = {
  panes: [
    {
      id: 'price',
      heightRatio: 3,  // 75% of height
      yScale: { mode: 'auto' },
      series: [{ key: 'candles', type: 'ohlc', data: candles }],
    },
    {
      id: 'dss',
      heightRatio: 1,  // 25% of height
      yScale: { mode: 'fixed', min: 0, max: 100 },
      series: [
        { key: 'dss', type: 'line', data: dssData, color: '#22c55e' },
        { key: 'signal', type: 'line', data: signalData, color: '#ef4444' },
      ],
      guides: [
        { y: 80, dashed: true, label: 'OB', color: '#ef4444' },
        { y: 20, dashed: true, label: 'OS', color: '#22c55e' },
      ],
    },
  ],
};
```

## DWLFChart Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `spec` | `ChartSpec` | — | Chart specification (panes, series, guides) |
| `darkMode` | `boolean` | `true` | Dark/light theme |
| `enablePanZoom` | `boolean` | `false` | Enable scroll-to-zoom and drag-to-pan |
| `timeframe` | `string` | `'daily'` | Affects X-axis date formatting (`'daily'`, `'weekly'`, `'4h'`, `'1h'`) |
| `initialVisibleCount` | `number` | — | Number of candles visible initially (controls default zoom) |
| `extraRightSlots` | `number` | — | Extra padding on the right edge |
| `compressGaps` | `boolean` | `false` | Remove weekend/holiday gaps |
| `crosshairSnapMode` | `'series' \| 'pointer'` | `'series'` | `'pointer'` follows mouse freely, `'series'` snaps to nearest candle |
| `showCrosshairPriceLabel` | `boolean` | — | Show price label on crosshair |
| `axisColors` | `{ light?: string; dark?: string }` | — | Custom axis/crosshair colors |
| `annotations` | `Annotation[]` | — | Chart annotations (lines, text, fib, etc.) |
| `className` | `string` | — | CSS class on container |
| `style` | `CSSProperties` | — | Inline styles on container |
| `animationState` | `ChartAnimationState` | — | Control entry animations |

## Crosshair Modes

By default the crosshair snaps to the nearest candle (`'series'` mode). Most traders prefer the crosshair to follow the mouse freely — use `'pointer'` mode:

```tsx
<DWLFChart spec={spec} crosshairSnapMode="pointer" />
```

| Mode | Behaviour |
|------|-----------|
| `'series'` (default) | Snaps to nearest candle — good for precise OHLC readouts |
| `'pointer'` | Follows mouse position freely — feels more natural for interactive use |

## Pan & Zoom

Set `enablePanZoom={true}` to enable scroll-to-zoom and drag-to-pan. **This is off by default**, so the chart won't capture mouse scroll events unless you opt in.

```tsx
<DWLFChart spec={spec} enablePanZoom={true} />
```

If the chart is embedded in a scrollable page, be aware that `enablePanZoom` will capture scroll events over the chart area for zooming. You may want to place the chart in a fixed-height container so page scrolling still works outside the chart.

Use `initialVisibleCount` to control how many candles are visible on first render (the default shows all data):

```tsx
<DWLFChart spec={spec} enablePanZoom={true} initialVisibleCount={100} />
```

## Right-Side Buffer

By default the chart fits data edge-to-edge. To add empty space on the right (useful for seeing the latest candle clearly or leaving room for annotations), use `extraRightSlots`:

```tsx
<DWLFChart spec={spec} extraRightSlots={5} />
```

This adds 5 candle-widths of empty space to the right of the last data point.

Alternatively, you can append placeholder candles to your data with the same timestamp spacing but no visible data — the chart will render the empty space naturally.

## Annotations

20+ built-in annotation types with creation helpers:

```tsx
import {
  DWLFChart,
  AnnotationLayer,
  createHLineAnnotation,
  createTrendLineAnnotation,
  createFibRetracementAnnotation,
} from '@dwlf/charting';

const annotations = [
  createHLineAnnotation({ price: 42000, label: 'Support', color: '#22c55e' }),
  createTrendLineAnnotation({ time1, price1, time2, price2, color: '#3b82f6' }),
  createFibRetracementAnnotation({ time1, price1, time2, price2 }),
];

<DWLFChart
  spec={spec}
  annotations={annotations}
  onAnnotationSelect={(id) => console.log('selected', id)}
  onAnnotationMove={(id, update) => console.log('moved', id, update)}
/>
```

**Available annotations:** Horizontal Line, Vertical Line, Text, Trend Line, Ray, Cross Line, Rectangle, Channel, Fibonacci Retracement, Fibonacci Extension, Measure, Pitchfork, Arrow, Time Range, Alert Line, Brush, Emoji, Order Block, Fair Value Gap, BOS Line.

## Hooks

```tsx
import {
  useCandlestickChart,   // D3 scales and layout for candlestick data
  useChartPanZoom,        // Pan and zoom state management
  useChartLayout,         // Chart dimension calculations
  useContainerSize,       // Responsive container sizing
  useChartAnimations,     // Entry animation orchestration
  useOverlayToggles,      // Overlay visibility management
} from '@dwlf/charting';
```

## Using with @dwlf/indicators

Fetch candles from your data source, compute indicators, render:

```tsx
import { EMA, Bollinger, DSS } from '@dwlf/indicators';
import { DWLFChart } from '@dwlf/charting';
import '@dwlf/charting/styles';

// Compute indicators (timestamps must match your candle timestamps)
const ema8 = EMA.computeEMA(candles, { length: 8 });
const bb = Bollinger.computeBollingerBands(candles, { length: 20 });

// Build chart spec — remember to convert timestamps to milliseconds
const spec = {
  panes: [{
    id: 'price',
    heightRatio: 1,
    yScale: { mode: 'auto' },
    series: [
      { key: 'candles', type: 'ohlc', data: candles.map(c => ({ ...c, t: c.t * 1000 })) },
      { key: 'ema8', type: 'line', data: ema8.ema.map(p => ({ t: p.t * 1000, v: p.v })), color: '#58a6ff' },
      { key: 'bb-upper', type: 'line', data: bb.upper.map(p => ({ t: p.t * 1000, v: p.v })), color: '#8b949e', style: { dashed: true } },
      { key: 'bb-lower', type: 'line', data: bb.lower.map(p => ({ t: p.t * 1000, v: p.v })), color: '#8b949e', style: { dashed: true } },
    ],
  }],
};
```

## Tutorial: Build Your First Dashboard

For a complete step-by-step guide to building a market intelligence dashboard with `@dwlf/charting`, `@dwlf/indicators`, and the DWLF API, see **[Build Your First DWLF Dashboard](docs/BUILD-YOUR-FIRST-DASHBOARD.md)**.

## Used By

This is the same charting engine that powers [DWLF](https://dwlf.co.uk) — a market intelligence platform for AI agents and traders.

## License

MIT
