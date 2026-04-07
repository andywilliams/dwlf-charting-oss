import React from 'react';

/**
 * HorizontalLineOverlay
 * @param {Object} props
 * @param {number} props.value - The price level to draw the horizontal line at
 * @param {Function} props.yScale - D3 scale for y-axis (value -> px)
 * @param {number} props.width - Width of the chart area
 * @param {string} [props.stroke='red'] - Line color
 * @param {number} [props.strokeWidth=1.5] - Line thickness
 * @param {string} [props.strokeDasharray] - Dash pattern (e.g., '5,5' for dashed line)
 * @param {string} [props.label] - Optional label to display
 * @param {boolean} [props.showLabel=true] - Whether to show the label
 */
const HorizontalLineOverlay = ({ 
  value, 
  yScale, 
  width, 
  stroke = 'red', 
  strokeWidth = 1.5, 
  strokeDasharray,
  label,
  showLabel = true
}) => {
  if (value === undefined || value === null || !yScale || !width) return null;

  const y = yScale(value);
  
  // Don't render if the line would be outside the visible chart area
  const yRange = yScale.range();
  const minY = Math.min(...yRange);
  const maxY = Math.max(...yRange);
  if (y < minY || y > maxY) return null;

  return (
    <g className="horizontal-line-overlay">
      {/* Horizontal line */}
      <line
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      
      {/* Label */}
      {showLabel && label && (
        <g>
          {/* Label background */}
          <rect
            x={width - 60}
            y={y - 8}
            width={55}
            height={16}
            fill={stroke}
            fillOpacity={0.8}
            rx={2}
          />
          {/* Label text */}
          <text
            x={width - 32.5}
            y={y}
            dy="0.32em"
            textAnchor="middle"
            fontSize={10}
            fill="white"
            fontWeight="bold"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

export default HorizontalLineOverlay; 