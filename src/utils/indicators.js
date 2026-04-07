/**
 * Technical Indicator Calculations
 * Pure utility functions for calculating various technical indicators
 */

/**
 * Calculate Simple Moving Average values for chart data.
 * This function is intended to be used externally to calculate SMA data
 * before passing it to the chart component.
 * 
 * @param {Array<{ date: string, open: number, high: number, low: number, close: number }>} data
 * @param {number} period
 * @returns {Array<{ x: string, y: number }>}
 */
export function calculateSMA(data, period) {
  if (!Array.isArray(data) || data.length < period) return [];

  const result = [];

  for (let i = period - 1; i < data.length; i++) {
    const window = data.slice(i - period + 1, i + 1);
    const sum = window.reduce((acc, point) => acc + point.close, 0);
    const avg = sum / period;

    result.push({ x: data[i].date, y: avg });
  }

  return result;
}

/**
 * Calculate Exponential Moving Average values for chart data.
 * 
 * @param {Array<{ date: string, open: number, high: number, low: number, close: number }>} data
 * @param {number} period
 * @returns {Array<{ x: string, y: number }>}
 */
export function calculateEMA(data, period) {
  if (!Array.isArray(data) || data.length < period) return [];

  const result = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for the first value
  let ema = data.slice(0, period).reduce((sum, point) => sum + point.close, 0) / period;
  result.push({ x: data[period - 1].date, y: ema });

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
    result.push({ x: data[i].date, y: ema });
  }

  return result;
} 