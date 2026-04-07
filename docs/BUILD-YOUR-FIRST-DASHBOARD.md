# Build Your First DWLF Dashboard

A step-by-step guide to building a market intelligence dashboard using DWLF's API, open-source charting library, and indicator math. By the end, you'll have a React dashboard with candlestick charts, EMA/DSS/Bollinger overlays, custom event annotations, and a trend state framework.

**Time:** ~1 hour
**Prerequisites:** Node.js 18+, npm, basic React/TypeScript knowledge
**What you'll use:**
- `@dwlf/charting` — DWLF's open-source React charting library
- `@dwlf/indicators` — DWLF's open-source indicator math (DSS, EMA, Bollinger, etc.)
- DWLF API — for events, regime data, and custom event fires
- Binance US (or Twelve Data) — for OHLCV candle data

---

## 1. Register for a DWLF API Key

```bash
curl -X POST https://api.dwlf.co.uk/v2/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "agentId": "my-dashboard",
    "purpose": "personal market analysis",
    "disclaimerAccepted": true,
    "disclaimerVersion": "1.3"
  }'
```

Save the `apiKey` from the response. Check your email to activate the account.

## 2. Set Up the Project

### Backend (Express proxy)

The backend proxies DWLF API calls (keeping your key server-side) and fetches candle data from Binance.

```bash
mkdir btc-dashboard && cd btc-dashboard
npm init -y
npm install express
```

Create `.env`:
```
DWLF_API_KEY=your_dwlf_api_key_here
DWLF_API_BASE=https://api.dwlf.co.uk/v2
```

Create `server.js`:
```javascript
const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const API_KEY = process.env.DWLF_API_KEY;
const API_BASE = process.env.DWLF_API_BASE || 'https://api.dwlf.co.uk/v2';
const app = express();

// Binance US candle proxy (crypto, no auth needed)
app.get('/binance/klines', async (req, res) => {
  const { symbol = 'BTCUSDT', interval = '1d', limit = '200' } = req.query;
  try {
    const resp = await fetch(`https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const raw = await resp.json();
    const candles = raw.map(c => ({
      date: new Date(c[0]).toISOString().slice(0, 10),
      open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
    res.json({ symbol, interval, candles });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch candles' });
  }
});

// DWLF API proxy (adds auth header)
app.get('/api/*', async (req, res) => {
  const apiPath = req.params[0];
  const qs = new URLSearchParams(req.query).toString();
  const url = `${API_BASE}/${apiPath}${qs ? '?' + qs : ''}`;
  try {
    const resp = await fetch(url, { headers: { 'Authorization': `ApiKey ${API_KEY}` } });
    res.json(await resp.json());
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch from DWLF' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
```

### Frontend (React + Vite)

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @dwlf/charting @dwlf/indicators
```

Configure `vite.config.ts` to proxy to the backend:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/binance': 'http://localhost:3000',
    },
  },
})
```

## 3. Build the Chart Component

This is the core of the dashboard — a candlestick chart with DWLF indicators computed locally.

Create `src/components/BTCChart.tsx`:
```tsx
import { DWLFChart, createVLineAnnotation } from '@dwlf/charting';
import '@dwlf/charting/styles';
import { DSS, EMA, Bollinger } from '@dwlf/indicators';
import type { Candle } from '@dwlf/indicators';

type CandleRaw = { date: string; open: number; high: number; low: number; close: number };

function toCandles(raw: CandleRaw[]): Candle[] {
  return raw.map(c => ({
    t: new Date(c.date + 'T00:00:00Z').getTime(), // milliseconds for charting
    o: c.open, h: c.high, l: c.low, c: c.close, v: 0,
  }));
}

export function BTCChart({ candles }: { candles: CandleRaw[] }) {
  if (candles.length < 20) return <div>Loading chart...</div>;

  const indCandles = toCandles(candles);

  // Compute indicators — same math DWLF uses internally
  const ema8 = EMA.computeEMA(indCandles, { length: 8 });
  const ema21 = EMA.computeEMA(indCandles, { length: 21 });
  const ema55 = EMA.computeEMA(indCandles, { length: 55 });
  const dss = DSS.computeDSS(indCandles);
  const bb = Bollinger.computeBollingerBands(indCandles);

  const ohlcData = indCandles.map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c }));

  const spec = {
    panes: [
      {
        id: 'price',
        heightRatio: 3,
        yScale: { mode: 'auto' as const },
        series: [
          { key: 'bb-upper', type: 'line' as const, data: bb.upper, color: 'rgba(88,166,255,0.25)' },
          { key: 'bb-lower', type: 'line' as const, data: bb.lower, color: 'rgba(88,166,255,0.25)' },
          { key: 'ema55', type: 'line' as const, data: ema55.ema, color: '#d29922', style: { lineWidth: 2 } },
          { key: 'ema21', type: 'line' as const, data: ema21.ema, color: '#bc8cff', style: { lineWidth: 2 } },
          { key: 'ema8', type: 'line' as const, data: ema8.ema, color: '#58a6ff', style: { lineWidth: 2 } },
          { key: 'candles', type: 'ohlc' as const, data: ohlcData },
        ],
      },
      {
        id: 'dss',
        heightRatio: 1,
        yScale: { mode: 'fixed' as const, min: 0, max: 100 },
        series: [
          { key: 'dss', type: 'line' as const, data: dss.dss, color: '#3fb950', style: { lineWidth: 2 } },
          { key: 'signal', type: 'line' as const, data: dss.signal, color: '#f85149', style: { lineWidth: 1.5 } },
        ],
        guides: [
          { y: 80, dashed: true, label: 'OB', color: '#ef4444' },
          { y: 20, dashed: true, label: 'OS', color: '#22c55e' },
        ],
      },
    ],
  };

  return (
    <div style={{ height: 520 }}>
      <DWLFChart
        spec={spec}
        darkMode={true}
        enablePanZoom={true}
        extraRightSlots={15}
        initialVisibleCount={120}
        crosshairSnapMode="pointer"
      />
    </div>
  );
}
```

**Key points:**
- Every series needs a unique `key` string — the chart uses this for tooltips and animation ordering
- `@dwlf/indicators` functions take `(candles, optionalParams)` — e.g. `{ length: 8 }`, not a bare number
- Indicator output is `LinePoint[]` (`{ t, v }`) which maps directly to line series data
- Timestamps must be **milliseconds** (not seconds) — multiply by 1000 if your source uses seconds
- `darkMode={true}` is the default, but set it explicitly for clarity
- `enablePanZoom={true}` enables scroll-to-zoom and drag-to-pan (off by default to avoid capturing scroll events)
- `crosshairSnapMode="pointer"` makes the crosshair follow the mouse freely (default snaps to nearest candle)
- `extraRightSlots={15}` adds empty space after the last candle

## 4. Fetch Data from DWLF

Create a hook to fetch from both DWLF and Binance:

```typescript
// src/hooks/useDashboardData.ts
import { useState, useEffect } from 'react';

export function useDashboardData() {
  const [data, setData] = useState({ candles: [], events: [], loading: true });

  useEffect(() => {
    async function load() {
      const [candleRes, eventsRes] = await Promise.allSettled([
        fetch('/binance/klines?symbol=BTCUSDT&interval=1d&limit=200').then(r => r.json()),
        fetch('/api/events?days=90&limit=200&sortOrder=desc&symbols=BTC%2FUSD').then(r => r.json()),
      ]);

      setData({
        candles: candleRes.status === 'fulfilled' ? candleRes.value.candles || [] : [],
        events: eventsRes.status === 'fulfilled' ? eventsRes.value.events || [] : [],
        loading: false,
      });
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(id);
  }, []);

  return data;
}
```

**Important:** Use the authenticated `/api/events` endpoint (not `/api/public/market-pulse`) for accurate event data.

## 5. Add Event Annotations

Mark DWLF events directly on the chart using the annotation system:

```tsx
import { createVLineAnnotation } from '@dwlf/charting';

// Filter to key structural events
const KEY_EVENTS = new Set([
  'swing_high_break', 'swing_low_break',
  'ema_bullish_alignment', 'ema_bearish_alignment',
  'higher_low', 'lower_high',
  'dss.level.oversold', 'dss.level.overbought',
]);

const annotations = events
  .filter(ev => KEY_EVENTS.has(ev.eventType))
  .map(ev => {
    const ts = new Date(ev.date + 'T00:00:00Z').getTime();
    const isBullish = ['swing_high_break', 'ema_bullish_alignment', 'higher_low', 'dss.level.oversold'].includes(ev.eventType);

    return createVLineAnnotation('BTC/USD', 'daily', ts, {
      color: isBullish ? '#3fb950' : '#f85149',
      lineStyle: 'dashed',
      lineWidth: 1,
      label: ev.eventType.replace(/[._]/g, ' '),
      showTime: false,
    });
  });

// Pass to DWLFChart
<DWLFChart spec={spec} annotations={annotations} />
```

**Tip:** Filter aggressively. Showing every event clutters the chart. Start with structural events (swing breaks, EMA alignment) and add more as needed.

## 6. Add Custom Events for Trend Detection

Create custom events on DWLF that combine multiple conditions:

```bash
# Create "Uptrend Confirmed" — fires when EMA bullish + higher low
curl -X POST https://api.dwlf.co.uk/v2/custom-events \
  -H "Authorization: ApiKey YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Uptrend Confirmed",
    "description": "EMA bullish alignment AND higher low on daily",
    "visual": {
      "nodes": [
        {"id":"n1","type":"conditionNode","position":{"x":100,"y":100},"data":{"label":"EMA Bullish","nodeType":"ema_bullish_alignment","timeframe":"daily"}},
        {"id":"n2","type":"conditionNode","position":{"x":100,"y":250},"data":{"label":"Higher Low","nodeType":"higher_low","timeframe":"daily"}},
        {"id":"n3","type":"logicNode","position":{"x":350,"y":175},"data":{"label":"AND Gate","nodeType":"and_gate"}},
        {"id":"n4","type":"outputNode","position":{"x":550,"y":175},"data":{"label":"Fire Event","nodeType":"fire_event"}}
      ],
      "edges": [
        {"id":"e1","source":"n1","target":"n3"},
        {"id":"e2","source":"n2","target":"n3"},
        {"id":"e3","source":"n3","target":"n4"}
      ]
    }
  }'

# Compile it
curl -X POST https://api.dwlf.co.uk/v2/custom-events/EVENT_ID/compile \
  -H "Authorization: ApiKey YOUR_KEY"

# Activate on symbols
curl -X POST https://api.dwlf.co.uk/v2/custom-event-symbols \
  -H "Authorization: ApiKey YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventId": "EVENT_ID", "symbol": "BTC-USD", "timeframe": "daily"}'

# Trigger evaluation to get historical fires
curl -X POST https://api.dwlf.co.uk/v2/evaluations \
  -H "Authorization: ApiKey YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "events", "symbols": ["BTC-USD"], "days": 365}'
```

**Key gotchas:**
- Every event graph **must** end with a `fire_event` output node
- Use `POST /v2/evaluations` (not `/custom-events/{id}/evaluate`) to trigger historical evaluation
- Timeframe values: `daily`, `weekly`, `4h`, `1h` (never `1d` or `1w`)
- Check available node types at `GET /v2/node-types`

## 7. Recommended Event Framework

Three events give you a complete trend state:

| Event | Logic | What it tells you |
|-------|-------|-------------------|
| **Uptrend Confirmed** | EMA bullish alignment + Higher low | Trend is up, buy dips |
| **Momentum Reversal** | DSS oversold + Higher low | Potential reversal forming |
| **Downtrend Confirmed** | EMA bearish alignment + Lower high | Trend is down, stay defensive |

Show these as solid vertical lines on the chart (green/yellow/red) — they fire rarely but with high conviction.

## 8. Run It

```bash
# Terminal 1 — backend
node server.js

# Terminal 2 — frontend
cd frontend && npx vite
```

Open `http://localhost:5173`

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Binance US │────▶│   Express   │◀────│   DWLF API   │
│  (candles)  │     │   Proxy     │     │  (events,    │
└─────────────┘     │  :3000      │     │   regime,    │
                    └──────┬──────┘     │   FSM)       │
                           │            └──────────────┘
                    ┌──────┴──────┐
                    │  React App  │
                    │  :5173      │
                    │             │
                    │ @dwlf/chart │ ◀── candlesticks, annotations
                    │ @dwlf/ind.  │ ◀── EMA, DSS, Bollinger math
                    └─────────────┘
```

**Data flow:**
1. Binance provides raw OHLCV candles
2. `@dwlf/indicators` computes EMA/DSS/Bollinger locally (same math DWLF uses)
3. DWLF API provides events, regime classification, custom event fires
4. `@dwlf/charting` renders everything in a multi-pane dark-themed chart
5. Event annotations mark where DWLF events fired on the price chart

## Tips

- **Filter events aggressively** for chart annotations — show structural events (swing breaks, EMA alignment, trend confirmations), not every indicator touch
- **Use custom events** as your default chart annotations — they fire less often but with higher conviction than individual indicator events
- **Add a toggle** between custom events and indicator events so users can drill into detail when needed
- **The `/v2/events` endpoint** (authenticated) is the source of truth — don't use `/public/market-pulse` for event data as it can be out of sync
- **Refresh every 5 minutes** — DWLF evaluates daily, but regime and FSM data can update intraday

## Next Steps

- Add more symbols (use Twelve Data instead of Binance for equities, metals, FX)
- Build sector dashboards (metals, crypto, tech)
- Add trade signal cards when strategies fire
- Backtest strategies via `POST /v2/backtests` (minimum 200 candles / ~10 months)

---

Built with [DWLF](https://dwlf.co.uk) — structured market intelligence for AI agents.
