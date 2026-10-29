import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TimeRangeAnnotationView from '../TimeRangeAnnotationView';
import { createTimeRangeAnnotation } from '../AnnotationLayer';

const draw = (options: Parameters<typeof createTimeRangeAnnotation>[4]) =>
  renderToStaticMarkup(
    <svg>
      <TimeRangeAnnotationView
        annotation={createTimeRangeAnnotation('XAU/USD', '1w', 1000, 2000, { color: '#4F5B66', fillOpacity: 0.5, ...options })}
        xScale={((t: number) => t / 10) as never}
        chartWidth={400}
        paneHeight={300}
      />
    </svg>,
  );

describe('TimeRangeAnnotationView fill', () => {
  it('fills the band solid by default, as before', () => {
    const markup = draw({});
    expect(markup).not.toContain('<pattern');
    expect(markup).toContain('data-fill-pattern="solid"');
    expect(markup).toMatch(/fill="#4F5B66" fill-opacity="0.5"/);
  });

  it('hatches the band at 45° in its colour, at its strength, when asked', () => {
    const markup = draw({ fillPattern: 'hatch', hatchSpacing: 5 });
    expect(markup).toMatch(/<pattern id="(timerange-hatch-[^"]+)" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate\(45\)">/);
    const id = /<pattern id="([^"]+)"/.exec(markup)![1];
    expect(markup).toContain(`fill="url(#${id})"`);
    expect(markup).toContain('x1="2.5" y1="0" x2="2.5" y2="5" stroke="#4F5B66" stroke-width="1" stroke-opacity="0.5"');
  });

  it('gives each hatched band its own pattern', () => {
    const a = /<pattern id="([^"]+)"/.exec(draw({ fillPattern: 'hatch' }))![1];
    const b = /<pattern id="([^"]+)"/.exec(draw({ fillPattern: 'hatch' }))![1];
    expect(a).not.toBe(b);
  });
});

const drawWith = (options: Parameters<typeof createTimeRangeAnnotation>[4], time1 = 1000, time2 = 2000) =>
  renderToStaticMarkup(
    <svg>
      <TimeRangeAnnotationView
        annotation={{ ...createTimeRangeAnnotation('XAU/USD', '1w', time1, time2, { color: '#4F5B66', fillOpacity: 0.5, ...options }) }}
        xScale={((t: number) => t / 10) as never}
        chartWidth={400}
        paneHeight={300}
      />
    </svg>,
  );

describe('TimeRangeAnnotationView hatch guards', () => {
  it('falls back to the default spacing for a spacing of 0, a negative or a non-number, so the band is never left unfilled', () => {
    for (const hatchSpacing of [0, -3, Number.NaN]) expect(drawWith({ fillPattern: 'hatch', hatchSpacing })).toContain('width="6" height="6"');
  });

  it('never gives two different ids the same pattern', () => {
    const idFor = (id: string) => /<pattern id="([^"]+)"/.exec(renderToStaticMarkup(
      <svg>
        <TimeRangeAnnotationView annotation={{ ...createTimeRangeAnnotation('X', '1w', 1000, 2000, { fillPattern: 'hatch' }), id }} xScale={((t: number) => t / 10) as never} chartWidth={400} paneHeight={300} />
      </svg>,
    ))![1];
    const ids = ['win.1', 'win:1', 'win_1', 'win-1'].map(idFor);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('TimeRangeAnnotationView label', () => {
  it('starts a text label at the plot\'s left edge when the band began before it', () => {
    expect(drawWith({ label: 'LOW', labelStyle: 'text' }, -500, 1500).match(/<text[^>]*>/)![0]).toContain('x="6"');
  });

  it('falls back to the default size and row for saved values it cannot use', () => {
    for (const bad of [{ labelFontSize: Number.NaN }, { labelFontSize: 0 }, { labelRow: -1 }, { labelRow: 1.5 }, { labelRow: Number.NaN }]) {
      expect(drawWith({ label: 'LOW', labelStyle: 'text', ...bad }).match(/<text[^>]*>/)![0]).toContain('y="17"');
    }
  });

  it('draws no text label for a band that ends before the plot\'s left edge', () => {
    expect(drawWith({ label: 'LOW WINDOW', labelStyle: 'text' }, -400, -100)).not.toContain('LOW WINDOW');
  });

  it('draws no text label for a band that starts past the plot\'s right edge', () => {
    const markup = drawWith({ label: 'HIGH WINDOW', labelStyle: 'text' }, 4100, 4400);
    expect(markup).not.toContain('HIGH WINDOW');
  });

  it('draws the default badge, white on the band colour, as before', () => {
    const markup = draw({ label: 'Window' });
    expect(markup).toContain('fill="white"');
    expect(markup).toContain('>Window<');
  });

  it('draws a text label in the band colour, with the halo and font the host gives, and no badge', () => {
    const markup = draw({ label: 'HIGH WINDOW', labelStyle: 'text', labelHalo: '#F8F5EE', labelFontFamily: 'IBM Plex Mono', labelFontSize: 12 });
    const text = markup.match(/<text[^>]*>HIGH WINDOW<\/text>/)![0];
    expect(text).toContain('fill="#4F5B66"');
    expect(text).toContain('stroke="#F8F5EE"');
    expect(text).toContain('paint-order="stroke"');
    expect(text).toContain('font-family="IBM Plex Mono"');
    expect(text).toContain('font-size="12"');
    expect(text).toContain('y="18"');
    expect(markup).not.toContain('fill="white"');
  });

  it('draws a text label in its own colour when the host gives one, the band keeping its colour', () => {
    const markup = draw({ label: 'LOW WINDOW', labelStyle: 'text', labelColor: '#7A5E28' });
    expect(markup.match(/<text[^>]*>/)![0]).toContain('fill="#7A5E28"');
    expect(markup).toMatch(/fill="#4F5B66" fill-opacity="0.5"/);
  });

  it('keeps a text label inside the plot: one that would run past the right edge ends at it', () => {
    const near = renderToStaticMarkup(
      <svg>
        <TimeRangeAnnotationView
          annotation={createTimeRangeAnnotation('XAU/USD', '1w', 3800, 3900, { color: '#4F5B66', label: 'HIGH WINDOW', labelStyle: 'text', labelFontSize: 12 })}
          xScale={((t: number) => t / 10) as never}
          chartWidth={400}
          paneHeight={300}
        />
      </svg>,
    ).match(/<text[^>]*>/)![0];
    expect(near).toContain('x="394"');
    expect(near).toContain('text-anchor="end"');
    expect(draw({ label: 'HIGH WINDOW', labelStyle: 'text' }).match(/<text[^>]*>/)![0]).toContain('text-anchor="start"');
  });

  it('puts a text label on the row asked for, so two overlapping bands never stack their labels', () => {
    const text = draw({ label: 'LOW WINDOW', labelStyle: 'text', labelFontSize: 12, labelRow: 1 }).match(/<text[^>]*>/)![0];
    expect(text).toContain('y="36"');
    expect(text).not.toContain('stroke=');
  });
});
