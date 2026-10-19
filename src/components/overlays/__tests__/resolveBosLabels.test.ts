import { describe, expect, it } from 'vitest';
import { createBosLineAnnotation } from '../AnnotationLayer';
import { bosGeometry, labelLayout, resolveBosLabels } from '../BosLineAnnotationView';
import { intersects } from '../zoneRects';

// x = time / 10; y = 300 - price.
const ctx = { xScale: ((t: number) => t / 10) as never, yScale: { domain: [0, 300] as [number, number], scale: (p: number) => 300 - p, invert: (v: number) => 300 - v }, chartWidth: 400 };
const PANE = { width: 400, height: 300 };
const line = (id: string, start: number, end: number, price: number, opts = {}) => ({
  ...createBosLineAnnotation('X', '1d', end, price, 'BOS', 'bearish', { startTime: start, showPrice: false, labelPlacement: 'auto', ...opts }),
  id,
});
const box = (a: ReturnType<typeof line>, placement: Parameters<typeof labelLayout>[0]) => {
  const g = bosGeometry(a, ctx);
  return labelLayout(placement, g.text, g.y, g.lineStartX, g.lineEndX, g.besideEndGap).box;
};

describe('resolveBosLabels (DWLF-472)', () => {
  it('gives the first line first choice, and moves a later label off the one already placed', () => {
    // Two breaks, far apart in price but ending at the same bar: both want end-above; the latest gets it.
    const latest = line('latest', 1000, 3000, 100);
    const earlier = line('earlier', 1500, 3000, 160);
    expect(resolveBosLabels([latest, earlier], ctx, [], PANE)).toEqual(new Map([['latest', 'end-above'], ['earlier', 'end-above']]));
    // Close in price: the latest's line blocks the earlier's end-above, and each label clears the other and both lines.
    const close = line('close', 1500, 3000, 108);
    const placed = resolveBosLabels([latest, close], ctx, [], PANE);
    const a = box(latest, placed.get('latest')!);
    const b = box(close, placed.get('close')!);
    expect(intersects(a, b)).toBe(false);
    for (const [label, other] of [[a, close], [b, latest]] as const) {
      const g = bosGeometry(other, ctx);
      expect(intersects(label, { left: g.lineStartX, right: g.lineEndX, top: g.y - 2, bottom: g.y + 2 })).toBe(false);
    }
  });

  it('keeps a label off another break\'s line, not only off its label', () => {
    // A long line just above a short one's break end: the short one's end-above label would sit on it.
    const short = line('short', 2500, 3000, 100);
    const long = line('long', 1000, 3500, 108, { showLabel: false });
    const placed = resolveBosLabels([short, long], ctx, [], PANE);
    expect(placed.get('short')).not.toBe('end-above');
    expect(placed.has('long')).toBe(false);
  });

  it('counts a fixed placement\'s label as placed, and leaves it as asked', () => {
    const fixed = line('fixed', 1000, 3000, 100, { labelPlacement: 'end-above' });
    const auto = line('auto', 1500, 3000, 104);
    const placed = resolveBosLabels([fixed, auto], ctx, [], PANE);
    expect(placed.has('fixed')).toBe(false);
    expect(placed.get('auto')).not.toBe('end-above');
  });
});
