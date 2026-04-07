import * as d3 from 'd3';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function useCandlestickChart(data, width, height, timeframe = 'daily', compressGaps = false) {
  const realData = data.filter(d => !d._virtual);
  const fullDates = data.map(d => new Date(d.date));
  const dates = realData.map(d => new Date(d.date));
  const invalidDates = fullDates.filter(d => isNaN(d.getTime()));
  if (invalidDates.length > 0 && (typeof import.meta === 'undefined' || !import.meta.env || import.meta.env.PROD === false)) {
    console.error('Found invalid dates in useCandlestickChart:', invalidDates);
  }

  // Build date->index map for compressed mode
  const dateToIndex = new Map();
  for (let i = 0; i < realData.length; i++) {
    const t = new Date(realData[i].date).getTime();
    dateToIndex.set(t, i);
  }

  // X scale: either real time or compressed (index-based)
  const timeDomain = d3.extent(fullDates);
  const virtualCount = Math.max(0, (data?.length || 0) - realData.length);
  const maxIndexWithVirtuals = Math.max(0, (realData.length - 1) + virtualCount);
  const xLinear = d3.scaleLinear()
    .domain([0, maxIndexWithVirtuals])
    .range([0, width]);
  const xTime = d3.scaleTime()
    .domain(timeDomain)
    .range([0, width]);

  const xScale = (function createXScale() {
    if (!compressGaps) return xTime;
    // Precompute sorted epoch times for binary search
    const indexTimes = realData.map(d => new Date(d.date).getTime());
    const bisect = d3.bisector(d => d).left;
    const fn = (value) => {
      if (value instanceof Date) {
        const t = value.getTime();
        let idx;
        if (dateToIndex.has(t)) {
          idx = dateToIndex.get(t);
        } else {
          // Nearest index to this date within the real data range
          idx = bisect(indexTimes, t);
          idx = Math.max(0, Math.min(realData.length - 1, idx));
        }
        return xLinear(idx);
      }
      // Assume already an index
      return xLinear(value);
    };
    // Provide invert for crosshair/ticks (returns index)
    fn.invert = (px) => xLinear.invert(px);
    return fn;
  })();

  // Add vertical padding so candles don't touch chart edges
  const minLow = d3.min(realData, d => d.low);
  const maxHigh = d3.max(realData, d => d.high);
  const range = maxHigh - minLow || 1; // avoid zero range
  const padding = range * 0.2; // 20 % padding on each side

  const yScale = d3.scaleLinear()
    .domain([minLow - padding, maxHigh + padding])
    .range([height, 0]);

  const lowerTf = (timeframe || '').toLowerCase();
  let candleWidth;
  if (realData.length > 1) {
    // Compute the minimum on-screen distance between consecutive real candles.
    // This guarantees bars never overlap even when timestamps are irregular
    // (e.g., market hours vs overnight gaps).
    let minDx = Infinity;
    let prevPx = null;
    for (let i = 0; i < realData.length; i++) {
      const d = realData[i];
      const px = xScale(new Date(d.date));
      if (prevPx !== null) {
        const dx = px - prevPx;
        if (dx > 0) minDx = Math.min(minDx, dx);
      }
      prevPx = px;
    }
    if (!isFinite(minDx) || minDx <= 0) {
      minDx = width / Math.max(1, realData.length - 1);
    }

    // Fill ratio tuned per timeframe. Using the minimum spacing keeps a small gap.
    const targetFill = lowerTf === 'hourly' ? 0.75 : 0.8;
    const baseWidth = minDx * targetFill;
    const [minWidth, maxWidth] = lowerTf === 'hourly'
      ? [0.5, 12]
      : [2, 18];
    candleWidth = clamp(baseWidth, minWidth, maxWidth);
  } else {
    candleWidth = lowerTf === 'hourly' ? Math.max(1, width * 0.006) : Math.max(6, width * 0.012);
  }

  const getCandleProps = d => {
    const open = yScale(d.open);
    const close = yScale(d.close);
    // Determine x position (compressed uses index mapping)
    let xVal;
    if (compressGaps) {
      const key = new Date(d.date).getTime();
      const idx = dateToIndex.has(key) ? dateToIndex.get(key) : 0;
      xVal = xLinear(idx);
    } else {
      xVal = xTime(new Date(d.date));
    }
    return {
      x: xVal,
      y: Math.min(open, close),
      height: Math.abs(open - close),
      width: candleWidth,
      color: d.close >= d.open ? 'green' : 'red'
    };
  };

  return {
    xScale,
    yScale,
    getCandleProps,
    xBandwidth: candleWidth,
    // expose helpers for compressed mode if needed externally
    _compressed: compressGaps,
    _indexToDate: realData.map(d => new Date(d.date))
  };
}
