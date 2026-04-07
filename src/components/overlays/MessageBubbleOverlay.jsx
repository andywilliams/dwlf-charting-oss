import React from 'react';
import PropTypes from 'prop-types';

/**
 * MessageBubbleOverlay
 * Renders text bubbles that optionally point at a specific candle (date / price).
 *
 * props:
 * - messages : Array<{
 *     date: string | Date,
 *     price: number,
 *     text: string,
 *   }>
 * - xScale : d3 scaleTime – maps dates => x coord
 * - yScale : d3 scaleLinear – maps prices => y coord
 * - xBandwidth : number – candle width, used to centre pointer over candlesticks
 * - chartWidth : number – inner drawing width of the chart (excluding margins)
 * - chartHeight : number – inner drawing height of the chart (excluding margins)
 * - bubbleColor : string – background colour of the bubble
 * - textColor : string – colour of the text inside the bubble
 * - fontSize : number – font size of the text
 * - pointer : boolean – whether to draw a pointer/line towards the candle (default true)
 * - padding : number – inner padding of the text inside the bubble (in px)
 */
export default function MessageBubbleOverlay({
  messages = [],
  xScale,
  yScale,
  xBandwidth = 0,
  chartWidth,
  chartHeight,
  bubbleColor = 'rgba(0,0,0,0.8)',
  textColor = 'white',
  fontSize = 11,
  pointer = true,
  padding = 6,
}) {
  if (!messages || messages.length === 0) return null;
  if (!xScale || !yScale || !chartWidth || !chartHeight) return null;

  // Approximate width of a character for the chosen font size (monospace-ish heuristic)
  const CHAR_WIDTH = fontSize * 0.6;

  const pointerHeight = 8; // px distance for pointer away from bubble

  const bubbles = messages.map((m, idx) => {
    let domainValue;
    if (typeof m.date === 'number') {
      domainValue = m.date;
    } else if (m.date instanceof Date) {
      domainValue = m.date;
    } else {
      domainValue = new Date(m.date);
    }
    const anchorX = xScale(domainValue);
    const anchorY = yScale(m.price);

    const textLines = `${m.text}`.split('\n');
    const maxLineLength = Math.max(...textLines.map((l) => l.length));
    const bubbleWidth = maxLineLength * CHAR_WIDTH + padding * 2;
    const lineHeight = fontSize * 1.2;
    const bubbleHeight = textLines.length * lineHeight + padding * 2;

    // Decide whether to place bubble above or below the anchor.
    let direction = 'above';
    let bubbleY = anchorY - pointerHeight - bubbleHeight;
    if (bubbleY < 0) {
      direction = 'below';
      bubbleY = anchorY + pointerHeight;
      // If it still does not fit below (e.g., at bottom), fallback to above.
      if (bubbleY + bubbleHeight > chartHeight) {
        direction = 'above';
        bubbleY = Math.max(0, anchorY - pointerHeight - bubbleHeight);
      }
    }

    // Horizontal positioning
    let bubbleX = anchorX - bubbleWidth / 2;
    if (bubbleX < 0) bubbleX = 0;
    if (bubbleX + bubbleWidth > chartWidth) bubbleX = chartWidth - bubbleWidth;

    // Base of pointer on bubble
    const baseY = direction === 'above' ? bubbleY + bubbleHeight : bubbleY;
    // Clamp baseX to bubble bounds so the pointer always touches the bubble edge
    const baseX = Math.min(Math.max(anchorX, bubbleX + padding), bubbleX + bubbleWidth - padding);

    return {
      key: idx,
      anchorX,
      anchorY,
      bubbleX,
      bubbleY,
      bubbleWidth,
      bubbleHeight,
      direction,
      baseX,
      baseY,
      textLines,
    };
  });

  return (
    <g className="message-bubble-overlay">
      {bubbles.map((b) => (
        <g key={`msg-bubble-${b.key}`}> 
          {/* Pointer */}
          {pointer && (
            <line
              x1={b.baseX}
              y1={b.baseY}
              x2={b.anchorX}
              y2={b.anchorY}
              stroke={bubbleColor}
              strokeWidth={1.2}
            />
          )}

          {/* Bubble background */}
          <rect
            x={b.bubbleX}
            y={b.bubbleY}
            width={b.bubbleWidth}
            height={b.bubbleHeight}
            fill={bubbleColor}
            rx={4}
            ry={4}
          />

          {/* Text */}
          {b.textLines.map((line, i) => (
            <text
              key={`txt-${b.key}-${i}`}
              x={b.bubbleX + padding}
              y={b.bubbleY + padding + fontSize + i * fontSize * 1.2 - fontSize * 0.2}
              fontSize={fontSize}
              fill={textColor}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}

MessageBubbleOverlay.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
      price: PropTypes.number.isRequired,
      text: PropTypes.string.isRequired,
    })
  ),
  xScale: PropTypes.func.isRequired,
  yScale: PropTypes.func.isRequired,
  xBandwidth: PropTypes.number,
  chartWidth: PropTypes.number.isRequired,
  chartHeight: PropTypes.number.isRequired,
  bubbleColor: PropTypes.string,
  textColor: PropTypes.string,
  fontSize: PropTypes.number,
  pointer: PropTypes.bool,
  padding: PropTypes.number,
}; 