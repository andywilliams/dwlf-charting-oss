import { describe, it, expect } from 'vitest';
import { slotMsForTimeframe, virtualSlotDates } from '../useChartPanZoomVirtual';

const DAY = 86_400_000;

/**
 * DWLF-266 — a virtual slot after the last candle is ONE BAR of the timeframe.
 * Weekly used to step a day per slot, so the blank right-hand gap covered a
 * seventh of the time it claimed and future overlays (a cycle window's close,
 * its hard max) fell off an axis no pan could reach.
 */
describe('slotMsForTimeframe — one bar of the timeframe', () => {
  it('hourly, daily, weekly in the spellings the UI uses; default daily', () => {
    expect(slotMsForTimeframe('hourly')).toBe(3_600_000);
    expect(slotMsForTimeframe('1h')).toBe(3_600_000);
    expect(slotMsForTimeframe('daily')).toBe(DAY);
    expect(slotMsForTimeframe('weekly')).toBe(7 * DAY);
    expect(slotMsForTimeframe('Weekly')).toBe(7 * DAY);
    expect(slotMsForTimeframe('1w')).toBe(7 * DAY);
    expect(slotMsForTimeframe(undefined)).toBe(DAY);
  });
});

describe('virtualSlotDates', () => {
  it('90 weekly slots reach 90 weeks past the last candle, each on the same weekday', () => {
    const slots = virtualSlotDates({ lastRealDate: '2026-09-07', baseOffset: 1, count: 90, timeframe: 'weekly' });
    expect(slots).toHaveLength(90);
    expect(slots[0]).toEqual({ date: '2026-09-14', _virtual: true });
    expect(slots[89].date).toBe('2028-05-29');
    for (const s of slots) expect(new Date(s.date).getUTCDay()).toBe(1);
  });

  it('daily slots still step a day; hourly keep the full ISO timestamp', () => {
    expect(virtualSlotDates({ lastRealDate: '2026-09-10', baseOffset: 1, count: 3, timeframe: 'daily' }).map((s) => s.date))
      .toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
    expect(virtualSlotDates({ lastRealDate: '2026-09-10T14:00:00.000Z', baseOffset: 1, count: 2, timeframe: 'hourly' }).map((s) => s.date))
      .toEqual(['2026-09-10T15:00:00.000Z', '2026-09-10T16:00:00.000Z']);
  });

  it('baseOffset places the first slot when the viewport starts inside the blank gap', () => {
    const slots = virtualSlotDates({ lastRealDate: '2026-09-07', baseOffset: 4, count: 2, timeframe: 'weekly' });
    expect(slots.map((s) => s.date)).toEqual(['2026-10-05', '2026-10-12']);
  });
});
