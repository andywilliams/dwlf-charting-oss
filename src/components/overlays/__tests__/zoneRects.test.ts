import { describe, expect, it } from 'vitest';
import { createFairValueGapAnnotation, createOrderBlockAnnotation } from '../AnnotationLayer';
import { autoPlacement, labelBox } from '../BosLineAnnotationView';
import { fairValueGapRect, intersects, orderBlockRect } from '../zoneRects';

// x = time / 10; y = 300 - price (so a higher price is higher on screen).
const ctx = { xScale: ((t: number) => t / 10) as never, yScale: { domain: [0, 300] as [number, number], scale: (p: number) => 300 - p, invert: (v: number) => 300 - v }, chartWidth: 400 };

describe('zone boxes', () => {
  it('an order block runs from just before its candle to its end time, clamped to the right edge', () => {
    const ob = createOrderBlockAnnotation('X', '1d', 1000, 150, 140, 'bearish');
    expect(orderBlockRect({ ...ob, endTime: 3000 }, ctx)).toEqual({ left: 80, right: 300, top: 150, bottom: 160 });
    expect(orderBlockRect({ ...ob, endTime: 9000 }, ctx)!.right).toBe(400);
    expect(orderBlockRect(ob, ctx)).toEqual({ left: 80, right: 120, top: 150, bottom: 160 });
  });

  it('a fair value gap spans its two times and its top and bottom', () => {
    expect(fairValueGapRect(createFairValueGapAnnotation('X', '1d', 2000, 1000, 120, 110, 'bullish'), ctx)).toEqual({ left: 100, right: 200, top: 180, bottom: 190 });
  });

  it('intersects only on a real overlap', () => {
    const a = { left: 0, right: 10, top: 0, bottom: 10 };
    expect(intersects(a, { left: 5, right: 15, top: 5, bottom: 15 })).toBe(true);
    expect(intersects(a, { left: 10, right: 20, top: 0, bottom: 10 })).toBe(false);
  });
});

describe('a BOS label placed automatically (DWLF-468)', () => {
  // A segment at y=200 from x=100 (the swing) to x=300 (the break).
  const PANE = { width: 400, height: 300 };
  const box = (p: Parameters<typeof labelBox>[0]) => labelBox(p, 'BOS', 200, 100, 300);

  it('keeps the default (above, at the break) when nothing is in the way', () => {
    expect(autoPlacement('BOS', 200, 100, 300, [], PANE, true)).toBe('end-above');
  });

  it('goes below when a zone sits just above the break end, and to the swing end when both sides there are taken', () => {
    const above = { left: 200, right: 400, top: 150, bottom: 195 };
    expect(autoPlacement('BOS', 200, 100, 300, [above], PANE, true)).toBe('end-below');
    const below = { left: 0, right: 400, top: 205, bottom: 260 };
    expect(autoPlacement('BOS', 200, 100, 300, [above, below], PANE, true)).toBe('start-above');
    expect(intersects(box('start-above'), above)).toBe(false);
  });

  it('falls back to the default when every place is taken (the halo still lets it read)', () => {
    expect(autoPlacement('BOS', 200, 100, 300, [{ left: 0, right: 400, top: 0, bottom: 400 }], PANE, true)).toBe('end-above');
  });

  it('never picks a place off the pane: a swing panned off the left edge, or a line at the pane top', () => {
    const above = { left: 200, right: 400, top: 150, bottom: 195 };
    const below = { left: 200, right: 400, top: 205, bottom: 260 };
    // The swing end is at x=-50: every start placement would draw off screen, so beside the break (or, with a
    // price badge there, the default) stands.
    expect(autoPlacement('BOS', 200, -50, 300, [above, below], PANE, true)).toBe('end-beside');
    expect(autoPlacement('BOS', 200, -50, 300, [above, below], PANE, true, true)).toBe('end-above');
    expect(autoPlacement('BOS', 5, 100, 300, [], PANE, true)).toBe('end-below');
    // The break panned past the right edge, with zones over both swing-end places: on the pane over a zone beats off it.
    const startZones = [{ left: 0, right: 200, top: 150, bottom: 199 }, { left: 0, right: 200, top: 201, bottom: 260 }];
    expect(autoPlacement('BOS', 200, 100, 500, startZones, PANE, true)).toBe('start-above');
  });

  it('a full-width line only tries its left end, never its right (the price badge is there)', () => {
    expect(autoPlacement('BOS', 200, 0, 400, [], PANE, false)).toBe('start-above');
    expect(autoPlacement('BOS', 200, 0, 400, [{ left: 0, right: 100, top: 150, bottom: 195 }], PANE, false)).toBe('start-below');
    expect(autoPlacement('BOS', 200, 0, 400, [{ left: 0, right: 400, top: 0, bottom: 400 }], PANE, false)).toBe('start-above');
  });

  it('goes beside the swing, level with the line, when zones crowd both sides at both ends (the DWLF-468 gold case)', () => {
    // A supply block just above and a demand block just below, both from just after the swing to the right edge.
    const supply = { left: 110, right: 400, top: 180, bottom: 194.5 };
    const demand = { left: 0, right: 400, top: 205.5, bottom: 240 };
    expect(autoPlacement('BOS', 200, 100, 300, [supply, demand], PANE, true)).toBe('start-beside');
    expect(box('start-beside')).toEqual({ left: 100 - 6 - 23.5, right: 94, top: 195, bottom: 205 });
  });

  it('tries beside the break only when no price badge sits there', () => {
    const everywhereButRight = [{ left: 0, right: 300, top: 0, bottom: 400 }];
    expect(autoPlacement('BOS', 200, 100, 300, everywhereButRight, PANE, true, false)).toBe('end-beside');
    expect(autoPlacement('BOS', 200, 100, 300, everywhereButRight, PANE, true, true)).toBe('end-above');
  });
});
