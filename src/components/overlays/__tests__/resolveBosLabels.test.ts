import { describe, expect, it } from 'vitest';
import { createBosLineAnnotation } from '../AnnotationLayer';
import { bosGeometry, labelLayout, resolveBosLabels } from '../bosLabels';
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
    expect(placed.get('short')).toBe('end-below');
    expect(placed.has('long')).toBe(false);
  });

  it('places a fixed label first, wherever it is listed, and leaves it as asked', () => {
    const fixed = line('fixed', 1000, 3000, 100, { labelPlacement: 'end-above' });
    const auto = line('auto', 1500, 3000, 104);
    for (const order of [[fixed, auto], [auto, fixed]]) {
      const placed = resolveBosLabels(order, ctx, [], PANE);
      expect(placed.has('fixed')).toBe(false);
      // end-above hits the fixed label, end-below the fixed line: the swing end above is clear.
      expect(placed.get('auto')).toBe('start-above');
    }
  });

  it('keeps a label off another line\'s price badge', () => {
    // A line breaking at x=260 (clear of the other's label) whose badge, at 266..324 on its own level, is not.
    const badged = line('badged', 2000, 2600, 112, { showPrice: true, showLabel: false });
    const plain = line('plain', 1500, 3000, 100);
    const withBadge = resolveBosLabels([plain, badged], ctx, [], PANE).get('plain');
    const withoutBadge = resolveBosLabels([plain, { ...badged, showPrice: false }], ctx, [], PANE).get('plain');
    expect(withoutBadge).toBe('end-above');
    expect(withBadge).not.toBe('end-above');
    expect(withBadge).toBeDefined();
  });
});
