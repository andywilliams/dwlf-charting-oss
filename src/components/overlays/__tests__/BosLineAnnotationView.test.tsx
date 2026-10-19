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

describe('BosLineAnnotationView beside labels', () => {
  it.each([
    ['start-beside', 'x="94"', 'end'],
    ['end-beside', 'x="206"', 'start'],
  ] as const)('places %s level with the line, reading outward', (labelPlacement, x, anchor) => {
    const text = draw({ labelPlacement });
    expect(text).toContain(x);
    expect(text).toContain(`text-anchor="${anchor}"`);
    expect(text).toContain('y="150"');
    expect(text).toContain('dominant-baseline="central"');
  });
});

describe('BosLineAnnotationView auto label', () => {
  it('draws an auto label on the side the zones leave clear', () => {
    const annotation = createBosLineAnnotation('XAU/USD', '1d', 2000, 100, 'BOS', 'bearish', { startTime: 1000, showPrice: false, labelPlacement: 'auto' });
    const markup = renderToStaticMarkup(
      <svg>
        <BosLineAnnotationView
          annotation={annotation}
          xScale={((t: number) => t / 10) as never}
          yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }}
          chartWidth={400}
          paneHeight={300}
          avoidRects={[{ left: 150, right: 400, top: 100, bottom: 147 }]}
        />
      </svg>,
    );
    const text = markup.match(/<text[^>]*>[^<]*<\/text>/)![0];
    expect(text).toContain('y="155"');
    expect(text).toContain('dominant-baseline="hanging"');
  });
});

describe('BosLineAnnotationView auto label and its own price badge', () => {
  const render = (showPrice: boolean) => {
    const annotation = createBosLineAnnotation('XAU/USD', '1d', 2000, 100, 'BOS', 'bearish', { startTime: 1000, showPrice, labelPlacement: 'auto' });
    const markup = renderToStaticMarkup(
      <svg>
        <BosLineAnnotationView
          annotation={annotation}
          xScale={((t: number) => t / 10) as never}
          yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }}
          chartWidth={400}
          paneHeight={300}
          avoidRects={[{ left: 0, right: 200, top: 0, bottom: 300 }]}
        />
      </svg>,
    );
    return markup.match(/<text[^>]*>BOS<\/text>/)![0];
  };

  it('goes beside the break when every place inside the line is taken, past its own price badge when one is drawn', () => {
    expect(render(false)).toContain('x="206"');
    // The badge for "100.00" is 58px wide (7px a character plus 16), so the label sits past it with 4px of air.
    const withBadge = render(true);
    expect(withBadge).toContain('x="268"');
    expect(withBadge).toContain('text-anchor="start"');
  });
});

describe('BosLineAnnotationView end-beside on a full-width line', () => {
  it('is drawn as start-beside, since the line\'s right end is the chart\'s edge', () => {
    const annotation = createBosLineAnnotation('XAU/USD', '1d', 2000, 100, 'BOS', 'bearish', { showPrice: false, labelPlacement: 'end-beside' });
    const markup = renderToStaticMarkup(
      <svg>
        <BosLineAnnotationView annotation={annotation} xScale={((t: number) => t / 10) as never} yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }} chartWidth={400} paneHeight={300} />
      </svg>,
    );
    const text = markup.match(/<text[^>]*>BOS<\/text>/)![0];
    expect(text).toContain('x="194"');
    expect(text).toContain('text-anchor="end"');
  });
});

describe('BosLineAnnotationView opacity (DWLF-472)', () => {
  it('draws a faint line and label, and multiplies a pending line\'s half strength', () => {
    const faint = renderToStaticMarkup(<svg><BosLineAnnotationView annotation={createBosLineAnnotation('X', '1d', 2000, 100, 'BOS', 'bearish', { startTime: 1000, showPrice: false, opacity: 0.4 })} xScale={((t: number) => t / 10) as never} yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }} chartWidth={400} paneHeight={300} /></svg>);
    expect(faint).toMatch(/<line[^>]*stroke-dasharray[^>]*opacity="0.4"|<line[^>]*opacity="0.4"/);
    expect(faint.match(/<text[^>]*>BOS<\/text>/)![0]).toContain('opacity="0.4"');
    const pending = renderToStaticMarkup(<svg><BosLineAnnotationView annotation={createBosLineAnnotation('X', '1d', 2000, 100, 'BOS', 'bearish', { startTime: 1000, showPrice: false, opacity: 0.4, confirmed: false })} xScale={((t: number) => t / 10) as never} yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }} chartWidth={400} paneHeight={300} /></svg>);
    expect(pending.match(/<text[^>]*>BOS<\/text>/)![0]).toContain('opacity="0.2"');
  });

  it('draws a resolved placement the layer gives it', () => {
    const markup = renderToStaticMarkup(<svg><BosLineAnnotationView annotation={createBosLineAnnotation('X', '1d', 2000, 100, 'BOS', 'bearish', { startTime: 1000, showPrice: false, labelPlacement: 'auto' })} resolvedPlacement="start-below" xScale={((t: number) => t / 10) as never} yScale={{ domain: [0, 200], scale: () => 150, invert: (v: number) => v }} chartWidth={400} paneHeight={300} /></svg>);
    const text = markup.match(/<text[^>]*>BOS<\/text>/)![0];
    expect(text).toContain('x="104"');
    expect(text).toContain('dominant-baseline="hanging"');
  });
});
