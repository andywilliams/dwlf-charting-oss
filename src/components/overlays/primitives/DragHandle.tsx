import React from 'react';
import { DRAG_HANDLE_SIZE, INDICATOR_LINE_START, INDICATOR_LINE_END } from '../annotationConstants';

export type DragAxis = 'horizontal' | 'vertical';

export interface DragHandleProps {
  /** Centre x of the handle in pane coords */
  cx: number;
  /** Centre y of the handle in pane coords */
  cy: number;
  /**
   * Which axis the handle drags along.
   *  - 'horizontal' = drags along Y (cursor ns-resize), grip lines drawn horizontally — used by HLine/AlertLine/BosLine.
   *  - 'vertical'   = drags along X (cursor ew-resize), grip lines drawn vertically   — used by VLine.
   */
  axis: DragAxis;
  /** Accent colour applied to border + grip lines (the annotation's own colour) */
  accentColor: string;
  size?: number;
  darkMode?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

const DragHandle: React.FC<DragHandleProps> = ({
  cx,
  cy,
  axis,
  accentColor,
  size = DRAG_HANDLE_SIZE,
  darkMode = false,
  onMouseDown,
}) => {
  const fillColor = darkMode ? '#e2e8f0' : '#1f2937';
  const cursor = axis === 'horizontal' ? 'ns-resize' : 'ew-resize';
  const half = size / 2;

  // Grip lines centred on the handle. They're drawn perpendicular to the drag axis
  // so they read as a "grippy" surface (like a handle to grab).
  const gripStart = (INDICATOR_LINE_START - DRAG_HANDLE_SIZE / 2) * (size / DRAG_HANDLE_SIZE);
  const gripEnd = (INDICATOR_LINE_END - DRAG_HANDLE_SIZE / 2) * (size / DRAG_HANDLE_SIZE);
  const gripOffset = 2;

  return (
    <g onMouseDown={onMouseDown} style={{ cursor }}>
      <rect
        x={cx - half}
        y={cy - half}
        width={size}
        height={size}
        fill={fillColor}
        fillOpacity={0.9}
        rx={3}
        stroke={accentColor}
        strokeWidth={2}
      />
      {axis === 'horizontal' ? (
        <>
          <line
            x1={cx + gripStart}
            x2={cx + gripEnd}
            y1={cy - gripOffset}
            y2={cy - gripOffset}
            stroke={accentColor}
            strokeWidth={1.5}
          />
          <line
            x1={cx + gripStart}
            x2={cx + gripEnd}
            y1={cy + gripOffset}
            y2={cy + gripOffset}
            stroke={accentColor}
            strokeWidth={1.5}
          />
        </>
      ) : (
        <>
          <line
            x1={cx - gripOffset}
            x2={cx - gripOffset}
            y1={cy + gripStart}
            y2={cy + gripEnd}
            stroke={accentColor}
            strokeWidth={1.5}
          />
          <line
            x1={cx + gripOffset}
            x2={cx + gripOffset}
            y1={cy + gripStart}
            y2={cy + gripEnd}
            stroke={accentColor}
            strokeWidth={1.5}
          />
        </>
      )}
    </g>
  );
};

export default DragHandle;
