import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AnnotationLayer, { createBosLineAnnotation, createFairValueGapAnnotation, createOrderBlockAnnotation } from '../AnnotationLayer';

// x = time / 10; y = 300 - price.
const draw = (zones: Parameters<typeof AnnotationLayer>[0]['annotations']) => {
  const bos = createBosLineAnnotation('XAU/USD', '1d', 3000, 100, 'BOS', 'bearish', { startTime: 1000, showPrice: false, labelPlacement: 'auto' });
  const markup = renderToStaticMarkup(
    <svg>
      <AnnotationLayer
        annotations={[...zones, bos]}
        xScale={((t: number) => t / 10) as never}
        yScale={{ domain: [0, 300], scale: (p: number) => 300 - p, invert: (v: number) => 300 - v }}
        chartWidth={400}
        paneHeight={300}
      />
    </svg>,
  );
  return markup.match(/<text[^>]*>BOS<\/text>/)![0];
};

describe('AnnotationLayer: an auto BOS label keeps clear of the zones it draws (DWLF-468)', () => {
  it('goes below the line when an order block sits just above the break end', () => {
    expect(draw([])).not.toContain('dominant-baseline="hanging"');
    const ob = { ...createOrderBlockAnnotation('XAU/USD', '1d', 2500, 130, 105, 'bearish'), endTime: 4000 };
    expect(draw([ob])).toContain('dominant-baseline="hanging"');
  });

  it('goes to the swing end when a fair value gap is above and an order block below the break end', () => {
    const fvg = createFairValueGapAnnotation('XAU/USD', '1d', 2500, 4000, 130, 105, 'bearish');
    const ob = { ...createOrderBlockAnnotation('XAU/USD', '1d', 2500, 95, 70, 'bullish'), endTime: 4000 };
    const text = draw([fvg, ob]);
    expect(text).toContain('text-anchor="start"');
    expect(text).toContain('x="104"');
  });
});
