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
      height: 300,
      series: [
        {
          type: 'ohlc',
          data: candles.map(c => ({
            x: new Date(c.t * 1000).toISOString(),
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
          })),
        },
      ],
    },
  ],
};

function MyChart() {
  return <DWLFChart spec={spec} />;
}
```

## Annotations

20+ built-in annotation types with drag-to-create and interactive editing:

```tsx
import { DWLFChart, AnnotationLayer, createHLineAnnotation } from '@dwlf/charting';

const annotations = [
  createHLineAnnotation({ price: 150, label: 'Support' }),
  createTrendLineAnnotation({ time1, price1, time2, price2 }),
  createFibRetracementAnnotation({ time1, price1, time2, price2 }),
];
```

**Available annotations:** Horizontal Line, Vertical Line, Text, Trend Line, Ray, Cross Line, Rectangle, Channel, Fibonacci Retracement, Fibonacci Extension, Measure, Pitchfork, Arrow, Time Range, Alert Line, Brush, Emoji, Order Block, Fair Value Gap, BOS Line.

## Hooks

```tsx
import {
  useCandlestickChart,
  useChartPanZoom,
  useChartLayout,
  useContainerSize,
  useChartAnimations,
} from '@dwlf/charting';
```

## Used By

This is the same charting engine that powers [DWLF](https://dwlf.co.uk) — a market intelligence platform for traders. The strategy builders, backtesting UI, and analytics dashboards that sit on top of this library are available via the DWLF platform.

## License

MIT
