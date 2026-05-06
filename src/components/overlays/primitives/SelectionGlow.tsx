import React from 'react';

export interface SelectionGlowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
  darkMode?: boolean;
  /** Extra width added to the underlying lineWidth (default 6) */
  extraWidth?: number;
}

const SelectionGlow: React.FC<SelectionGlowProps> = ({
  x1,
  y1,
  x2,
  y2,
  lineWidth,
  darkMode = false,
  extraWidth = 6,
}) => {
  const glowColor = darkMode ? 'rgba(99, 179, 237, 0.4)' : 'rgba(59, 130, 246, 0.4)';
  return (
    <line
      x1={x1}
      x2={x2}
      y1={y1}
      y2={y2}
      stroke={glowColor}
      strokeWidth={lineWidth + extraWidth}
      strokeLinecap="round"
      style={{ pointerEvents: 'none' }}
    />
  );
};

export default SelectionGlow;
