import React from 'react';
import { HIT_AREA_WIDTH } from '../annotationConstants';

export interface LineHitAreaProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  cursor?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
}

const LineHitArea: React.FC<LineHitAreaProps> = ({
  x1,
  y1,
  x2,
  y2,
  width = HIT_AREA_WIDTH,
  cursor = 'pointer',
  onMouseDown,
}) => (
  <line
    x1={x1}
    x2={x2}
    y1={y1}
    y2={y2}
    stroke="transparent"
    strokeWidth={width}
    strokeLinecap="round"
    style={{ cursor }}
    onMouseDown={onMouseDown}
  />
);

export default LineHitArea;
