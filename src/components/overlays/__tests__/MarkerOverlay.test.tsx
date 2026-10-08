import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkerOverlay from '../MarkerOverlay';

const draw = (shape: 'arrow-up' | 'arrow-down' | 'circle' | 'none') => renderToStaticMarkup(
  <svg>
    <MarkerOverlay
      points={[{ date: 0, price: 100, text: shape === 'arrow-up' ? 'WL' : 'WH' }]}
      xScale={() => 50}
      yScale={() => 200}
      shape={shape}
      size={7}
      animationPhase="complete"
    />
  </svg>,
);

const label = (markup: string) => markup.match(/<text[^>]*>/)![0];

describe('MarkerOverlay labels', () => {
  it("starts an up arrow's label below the arrow body, so the body does not cover it", () => {
    // The tip is at y=200 and the body runs to 207; the label hangs from 210.
    const text = label(draw('arrow-up'));
    expect(text).toContain('y="210"');
    expect(text).toContain('dominant-baseline="hanging"');
  });

  it.each(['arrow-down', 'circle', 'none'] as const)("keeps a %s label on its original baseline", (shape) => {
    const text = label(draw(shape));
    expect(text).toContain('y="211"');
    expect(text).not.toContain('dominant-baseline');
  });
});
