import React from 'react';

/**
 * DiagonalLineOverlay
 * Draws a straight line from (start.date, start.value) to (end.date, end.value).
 *
 * @param {Object} props
 * @param {{ date: string | Date, value: number }} props.start - Start position
 * @param {{ date: string | Date, value: number }} props.end - End position
 * @param {Function} props.xScale - D3 time scale (date -> px)
 * @param {Function} props.yScale - D3 linear scale (price -> px)
 * @param {number} props.xBandwidth - Width of one candlestick band (used to center the line on the candle)
 * @param {string} [props.stroke='purple'] - Line color
 * @param {number} [props.strokeWidth=1.5] - Line thickness
 * @param {string} [props.strokeDasharray] - Dash pattern (e.g., '5,5' for dashed)
 */
const DiagonalLineOverlay = ({
  start,
  end,
  xScale,
  yScale,
  xBandwidth,
  stroke = 'purple',
  strokeWidth = 1.5,
  strokeDasharray,
}) => {
  if (!start || !end || !xScale || !yScale) return null;

  const parseDate = (d) => (d instanceof Date ? d : new Date(d));

  const x1 = xScale(parseDate(start.date)) + xBandwidth / 2;
  const y1 = yScale(start.value);
  const x2 = xScale(parseDate(end.date)) + xBandwidth / 2;
  const y2 = yScale(end.value);

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

export default DiagonalLineOverlay; 