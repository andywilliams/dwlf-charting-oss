/**
 * One bar of a timeframe, in milliseconds. ONE rule for the whole package —
 * the virtual right-hand slots after the last candle, the pan range and x
 * scale, and the measure tool all size a bar with this (DWLF-266: they used
 * to disagree, and weekly's blank slots stepped a day).
 *
 * Matches by substring so the UI's spellings ('Weekly', '1w'… via 'week',
 * '1h'/'hourly'/'60m') all resolve; unknown ⇒ daily.
 */
export const estimateBarDurationMs = (timeframe: string | undefined | null): number => {
  if (!timeframe) return 86_400_000; // default daily
  const tf = timeframe.toLowerCase();
  // Longer minute spellings first: '15m' contains '5m', '30m' does not contain
  // '1m' but '1m' must still not swallow '1mo' — order is the rule here.
  if (tf.includes('15m')) return 900_000;
  if (tf.includes('30m')) return 1_800_000;
  if (tf.includes('5m')) return 300_000;
  if (tf.includes('1m') && !tf.includes('1mo')) return 60_000;
  if (tf.includes('4h')) return 14_400_000;
  if (tf.includes('hour') || tf === '1h' || tf === '60m') return 3_600_000;
  if (tf.includes('week') || tf === '1w') return 604_800_000;
  if (tf.includes('month') || tf.includes('1mo')) return 2_592_000_000;
  return 86_400_000; // daily
};

export const DAY_MS = 86_400_000;
