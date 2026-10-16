import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BosLineAnnotationView from '../BosLineAnnotationView';
import { createBosLineAnnotation } from '../AnnotationLayer';

const draw = (options: Parameters<typeof createBosLineAnnotation>[6], darkMode = false) => {
  const annotation = createBosLineAnnotation('XPT/USD', '1d', 2000, 100, 'ChoCH', 'bullish', { startTime: 1000, showPrice: false, ...options });
  const markup = renderToStaticMarkup(
    <svg>
      <BosLineAnnotationView
        annotation={annotation}
        xScale={((t: number) => t / 10) as never}
        yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }}
        chartWidth={400}
        paneHeight={300}
        darkMode={darkMode}
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

  it('outlines the label in the background colour when asked, so it reads over candles and zones', () => {
    expect(draw({ labelHalo: true })).toMatch(/stroke="#ffffff".*paint-order="stroke"|paint-order="stroke".*stroke="#ffffff"/);
    expect(draw({ labelHalo: true }, true)).toContain('stroke="#0f172a"');
  });
});
