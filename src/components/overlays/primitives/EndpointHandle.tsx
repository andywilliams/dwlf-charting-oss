import React from 'react';
import { HANDLE_RADIUS } from '../annotationConstants';

export interface EndpointHandleProps {
  cx: number;
  cy: number;
  radius?: number;
  /** Accent colour for the visible disc + ring (typically the annotation colour) */
  accentColor: string;
  /** When true the inner fill swaps to the accent for a "grabbed" look */
  isDragging?: boolean;
  darkMode?: boolean;
  cursor?: string;
  onMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Circular endpoint handle. The visible disc is small (8px radius), but the
 * invisible hit circle uses HANDLE_RADIUS so the grab target is generous.
 */
const EndpointHandle: React.FC<EndpointHandleProps> = ({
  cx,
  cy,
  radius = HANDLE_RADIUS,
  accentColor,
  isDragging = false,
  darkMode = false,
  cursor = 'grab',
  onMouseDown,
}) => {
  const fillColor = darkMode ? '#1f2937' : '#ffffff';
  const innerRadius = 5;
  const ringRadius = 7;

  return (
    <g
      onMouseDown={onMouseDown}
      style={{ cursor: isDragging ? 'grabbing' : cursor }}
    >
      {/* Invisible hit zone */}
      <circle cx={cx} cy={cy} r={radius} fill="transparent" />
      {/* Visible disc */}
      <circle
        cx={cx}
        cy={cy}
        r={ringRadius}
        fill={isDragging ? accentColor : fillColor}
        stroke={accentColor}
        strokeWidth={2}
      />
      {!isDragging && (
        <circle cx={cx} cy={cy} r={innerRadius - 2} fill={accentColor} />
      )}
    </g>
  );
};

export default EndpointHandle;
