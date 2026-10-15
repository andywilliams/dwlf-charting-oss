import { describe, it, expect } from 'vitest';
import { barsForPixels, wheelPanStep } from '../panStep';

// DWLF-436: a trackpad swipe moves the candles with the fingers, as a drag does.
const swipe = (deltaX: number, over: Partial<Parameters<typeof wheelPanStep>[0]> = {}) =>
  wheelPanStep({ start: 100, carryPx: 0, deltaX, deltaMode: 0, pxPerBar: 10, pageWidthPx: 800, ...over });

describe('wheelPanStep', () => {
  it('a swipe right (negative deltaX, as a page scrolls left) shows older bars; a swipe left, newer', () => {
    expect(swipe(-30).start).toBe(98);
    expect(swipe(30).start).toBe(102);
  });

  it('carries travel short of a bar, so a slow swipe of small events still pans', () => {
    let state = { start: 100, carryPx: 0 };
    for (let i = 0; i < 10; i++) state = swipe(-3, state);
    expect(state.start).toBe(98);
    expect(state.carryPx).toBe(0);
  });

  it('reads line- and page-mode events as pixels', () => {
    expect(swipe(1, { deltaMode: 1 }).start).toBe(101);
    expect(swipe(-1, { deltaMode: 2 }).start).toBe(100 - Math.round(800 / 15));
  });
});

describe('barsForPixels', () => {
  it('rounds the same way in both directions, never to -0', () => {
    expect(barsForPixels(7.5, 10)).toBe(1);
    expect(barsForPixels(-7.5, 10)).toBe(-1);
    expect(Object.is(barsForPixels(-7, 10), 0)).toBe(true);
  });
});
