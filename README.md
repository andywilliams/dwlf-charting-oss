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

This controls the background, text, grid, crosshair, tooltip, and candle colors automatically. To set the down-candle colour yourself, give the OHLC series `style.downColor`.

For further customisation, use `axisColors`:

```tsx
<DWLFChart
  spec={spec}
  darkMode={true}
  axisColors={{ dark: '#8b949e', light: '#57606a' }}
/>
```

To match the chart's surface to your own theme, pass `palette` with per-mode overrides. Any key left
out (or empty) keeps the default:

```tsx
<DWLFChart
  spec={spec}
  darkMode={isDark}
  palette={{
    dark: { background: '#0a0a0c', grid: 'rgba(255,255,255,0.06)', text: '#ffffff', tooltipBackground: '#18181c' },
    light: { background: '#ffffff', text: '#0a0a0c' },
  }}
/>
```

`background` is the plot surface. `grid` sets the grid lines, any pane guide without its own colour (e.g. 20/80 levels), and the tooltip border. `text` sets pane
titles, tooltip text and the crosshair price label; axis ticks use `axisColors`. `tooltipBackground` sets
the tooltip and the price-label box.

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
  downColor?: string;    // OHLC only: down-candle body colour (default: a darker shade of color)
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
| `visibleRange` | `{ startTime: number; endTime: number }` | — | Time span (epoch ms) the x-axis shows, set by the host; replaces pan/zoom while set |
| `visibleRangeTransitionMs` | `number` | `700` | How long a change of `visibleRange` eases for |
| `onVisibleRangeSettled` | `(range) => void` | — | Called once the chart shows `visibleRange` |
| `compressGaps` | `boolean` | `false` | Remove weekend/holiday gaps |
| `crosshairSnapMode` | `'series' \| 'pointer'` | `'series'` | `'pointer'` follows mouse freely, `'series'` snaps to nearest candle |
| `showCrosshairPriceLabel` | `boolean` | `true` | Show price label on crosshair |
| `axisColors` | `{ light?: string; dark?: string }` | — | Custom axis/crosshair colors |
| `palette` | `{ light?: ChartSurfaceColors; dark?: ChartSurfaceColors }` | — | Per-mode surface colours: `background`, `grid`, `text`, `tooltipBackground` |
| `showCrosshairTimeLabel` | `boolean` | `true` | Crosshair date as a label on the time axis |
| `showPaneTooltips` | `boolean` | `true` | Per-pane hover box (title, date, series values); turn off if the host shows hovered values itself |
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

## Steering the View

To move the chart from your own code — a guided tour, a story that zooms to each chapter — pass `visibleRange`, a span of time in epoch milliseconds:

```tsx
<DWLFChart spec={spec} timeframe="weekly" visibleRange={{ startTime: chapterStart, endTime: chapterEnd }} />
```

Only the bars in the range (and one either side) are drawn, and the price axis fits them. `endTime` may run past the last bar, into the blank slots, to show something projected ahead. When the range changes, the chart eases from the span on screen to the new one over `visibleRangeTransitionMs` (700 ms by default; `0` jumps). A reader who prefers reduced motion always gets the jump. `onVisibleRangeSettled` fires when the chart arrives, so you can reveal what belongs to the new view only once it is there. While `visibleRange` is set, the reader cannot pan or zoom (the handle's zoom and pan methods do nothing) and `compressGaps` is ignored; clearing it returns the chart to its default view.

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
