import { describe, expect, it } from 'vitest';
import { createFairValueGapAnnotation, createOrderBlockAnnotation } from '../AnnotationLayer';

// DWLF-461: both factories listed their fields by hand: the order block's dropped endTime and strokeOpacity, the gap's strokeOpacity.
describe('createOrderBlockAnnotation', () => {
  it('keeps every option it is given, endTime and strokeOpacity included', () => {
    const ob = createOrderBlockAnnotation('XAU/USD', '1d', 1000, 150, 140, 'bearish', { endTime: 5000, strokeOpacity: 0.4, state: 'tested', label: '' });
    expect(ob).toMatchObject({ type: 'order_block', time: 1000, endTime: 5000, strokeOpacity: 0.4, state: 'tested', label: '', high: 150, low: 140, direction: 'bearish' });
  });

  it('keeps the defaults when no option is given, and leaves endTime unset (the narrow box)', () => {
    const ob = createOrderBlockAnnotation('XAU/USD', '1d', 1000, 150, 140, 'bullish');
    expect(ob).toMatchObject({ state: 'active', color: '#22c55e', fillOpacity: 0.25, lineStyle: 'solid', lineWidth: 1 });
    expect('endTime' in ob).toBe(false);
    expect('strokeOpacity' in ob).toBe(false);
  });

  it('never lets an option override the identity fields', () => {
    const ob = createOrderBlockAnnotation('XAU/USD', '1d', 1000, 150, 140, 'bullish', { type: 'fair_value_gap', time: 9 } as never);
    expect(ob).toMatchObject({ type: 'order_block', time: 1000, symbol: 'XAU/USD' });
    expect(ob.id).toMatch(/^ob-/);
  });
});

describe('createFairValueGapAnnotation', () => {
  it('keeps every option it is given, strokeOpacity included', () => {
    const fvg = createFairValueGapAnnotation('XAU/USD', '1d', 1000, 2000, 120, 110, 'bullish', { strokeOpacity: 0.5, filled: true, label: 'FVG' });
    expect(fvg).toMatchObject({ type: 'fair_value_gap', time1: 1000, time2: 2000, top: 120, bottom: 110, strokeOpacity: 0.5, filled: true, label: 'FVG' });
  });

  it('keeps the defaults when no option is given', () => {
    const fvg = createFairValueGapAnnotation('XAU/USD', '1d', 1000, 2000, 120, 110, 'bearish');
    expect(fvg).toMatchObject({ filled: false, color: '#ef4444', fillOpacity: 0.2, lineStyle: 'solid', lineWidth: 1 });
    expect('strokeOpacity' in fvg).toBe(false);
  });

  it('never lets an option override the identity fields', () => {
    const fvg = createFairValueGapAnnotation('XAU/USD', '1d', 1000, 2000, 120, 110, 'bearish', { type: 'order_block', top: 1 } as never);
    expect(fvg).toMatchObject({ type: 'fair_value_gap', top: 120 });
    expect(fvg.id).toMatch(/^fvg-/);
  });
});
