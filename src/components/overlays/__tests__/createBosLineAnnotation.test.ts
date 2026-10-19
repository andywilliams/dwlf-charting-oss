import { describe, expect, it } from 'vitest';
import { createBosLineAnnotation } from '../AnnotationLayer';

describe('createBosLineAnnotation', () => {
  it('keeps the bounded segment and its custom type label (the view draws `label` in place of BOS/ChoCH)', () => {
    const a = createBosLineAnnotation('XPT/USD', '1d', 2000, 1825.92, 'ChoCH', 'bullish', { startTime: 1000, label: 'CHoCH', labelHalo: '#fff', labelPlacement: 'start-below' });
    expect(a).toMatchObject({ labelPlacement: 'start-below', type: 'bos_line', startTime: 1000, time: 2000, price: 1825.92, bosType: 'ChoCH', label: 'CHoCH', labelHalo: '#fff' });
  });

  it('leaves the label unset by default, so the view falls back to BOS/ChoCH', () => {
    const a = createBosLineAnnotation('XPT/USD', '1d', 2000, 1, 'BOS', 'bearish');
    expect(a.label).toBeUndefined();
    expect(a.labelHalo).toBeUndefined();
  });
});
