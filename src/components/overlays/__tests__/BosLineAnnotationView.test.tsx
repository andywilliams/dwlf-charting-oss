import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BosLineAnnotationView from '../BosLineAnnotationView';
import { createBosLineAnnotation } from '../AnnotationLayer';

const draw = (options: Parameters<typeof createBosLineAnnotation>[6]) => {
  const annotation = createBosLineAnnotation('XPT/USD', '1d', 2000, 100, 'ChoCH', 'bullish', { startTime: 1000, showPrice: false, ...options });
  const markup = renderToStaticMarkup(
    <svg>
      <BosLineAnnotationView
        annotation={annotation}
        xScale={((t: number) => t / 10) as never}
        yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }}
        chartWidth={400}
        paneHeight={300}
      />
    </svg>,
  );
  return markup.match(/<text[^>]*>[^<]*<\/text>/)![0];
};

describe('BosLineAnnotationView type label', () => {
  it('draws the custom label at the break end of a bounded segment, with no halo by default', () => {
    const text = draw({ label: 'CHoCH' });
    expect(text).toContain('>CHoCH<');
    expect(text).toContain('x="196"');
    expect(text).toContain('text-anchor="end"');
    expect(text).not.toContain('stroke=');
  });

  it('outlines the label in the colour the host gives (its background), so it reads over candles and zones', () => {
    const text = draw({ labelHalo: '#fbfaf6' });
    expect(text).toContain('stroke="#fbfaf6"');
    expect(text).toContain('paint-order="stroke"');
    expect(text).not.toContain(' opacity=');
  });

  it('dims only the text of a pending break with a halo, so the halo stays whole', () => {
    const text = draw({ labelHalo: '#fbfaf6', confirmed: false });
    expect(text).toContain('fill-opacity="0.5"');
    expect(text).not.toContain(' opacity=');
    expect(draw({ confirmed: false })).toContain(' opacity="0.5"');
  });

  it.each([
    ['end-above', 'x="196"', 'end', 'y="145"', false],
    ['end-below', 'x="196"', 'end', 'y="155"', true],
    ['start-above', 'x="104"', 'start', 'y="145"', false],
    ['start-below', 'x="104"', 'start', 'y="155"', true],
  ] as const)('places the label %s', (labelPlacement, x, anchor, y, hanging) => {
    const text = draw({ labelPlacement });
    expect(text).toContain(x);
    expect(text).toContain(`text-anchor="${anchor}"`);
    expect(text).toContain(y);
    expect(text.includes('dominant-baseline="hanging"')).toBe(hanging);
  });
});
