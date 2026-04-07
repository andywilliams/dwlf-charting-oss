import React from 'react';
import * as d3 from 'd3';

/**
 * SMAOverlay
 * @param {Object} props
 * @param {Array<{ date: string, value: number }>} props.data
 * @param {Function} props.xScale - D3 scale for x-axis (date -> px)
 * @param {Function} props.yScale - D3 scale for y-axis (value -> px)
 * @param {string} [props.stroke='orange'] - Line color
 * @param {number} [props.strokeWidth=1.5] - Line thickness
 */
const SMAOverlay = ({ data, xScale, yScale, stroke = 'orange', strokeWidth = 1.5 }) => {
  if (!data || data.length === 0 || !xScale || !yScale) return null;

  const lineGenerator = d3.line()
    .x(d => xScale(new Date(d.x)))
    .y(d => yScale(d.y))
    .curve(d3.curveMonotoneX);
  const pathData = lineGenerator(data);

  return (
    <path
      d={pathData}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
};

export default SMAOverlay;