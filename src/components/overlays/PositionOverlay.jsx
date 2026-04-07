import React, { useState } from 'react';
import PropTypes from 'prop-types';
import MessageBubbleOverlay from './MessageBubbleOverlay';

/**
 * PositionOverlay draws two semi-transparent rectangles to visualise
 * risk (entry ⇒ stop-loss) and reward (entry ⇒ take-profit).
 */
export default function PositionOverlay({
  startDate,
  endDate,
  entryPrice,
  stopPrice,
  takePrice,
  xScale,
  yScale,
  riskColor = 'rgba(255,0,0,0.25)',
  rewardColor = 'rgba(0,255,0,0.25)',
  messages = [],
  xBandwidth = 0,
  chartWidth,
  chartHeight,
  bubbleColor = 'rgba(0,0,0,0.8)',
  textColor = 'white',
  fontSize = 11,
  pointer = true,
  padding = 6,
}) {
  const [showMessages, setShowMessages] = useState(false);
  if (startDate == null || entryPrice == null || stopPrice == null || takePrice == null) return null;

  const normalizeDomainValue = (value, fallback) => {
    if (value == null) return fallback;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return value;
    return new Date(value);
  };

  const start = normalizeDomainValue(startDate, 0);
  const end = normalizeDomainValue(endDate ?? startDate, start);

  const x1 = xScale(start);
  const x2 = xScale(end);

  // Risk rectangle (entry → stopLoss)
  const riskY = yScale(Math.max(entryPrice, stopPrice));
  const riskHeight = Math.abs(yScale(entryPrice) - yScale(stopPrice));

  // Reward rectangle (entry → takeProfit)
  const rewardY = yScale(Math.max(entryPrice, takePrice));
  const rewardHeight = Math.abs(yScale(entryPrice) - yScale(takePrice));

  const width = x2 - x1;
  if (width <= 0) return null;

  return (
    <g
      className="position-overlay"
      onClick={(e) => {
        e.stopPropagation();
        setShowMessages((prev) => !prev);
      }}
      style={{ cursor: messages?.length ? 'pointer' : 'default' }}
    >
      <rect
        x={x1}
        y={riskY}
        width={width}
        height={riskHeight}
        fill={riskColor}
        stroke="none"
      />
      <rect
        x={x1}
        y={rewardY}
        width={width}
        height={rewardHeight}
        fill={rewardColor}
        stroke="none"
      />

      {showMessages && messages && messages.length > 0 && chartWidth && chartHeight && (
        <MessageBubbleOverlay
          messages={messages}
          xScale={xScale}
          yScale={yScale}
          xBandwidth={xBandwidth}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          bubbleColor={bubbleColor}
          textColor={textColor}
          fontSize={fontSize}
          pointer={pointer}
          padding={padding}
        />
      )}
    </g>
  );
}

PositionOverlay.propTypes = {
  startDate: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
  endDate: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]),
  entryPrice: PropTypes.number.isRequired,
  stopPrice: PropTypes.number.isRequired,
  takePrice: PropTypes.number.isRequired,
  xScale: PropTypes.func.isRequired,
  yScale: PropTypes.func.isRequired,
  riskColor: PropTypes.string,
  rewardColor: PropTypes.string,
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
      price: PropTypes.number.isRequired,
      text: PropTypes.string.isRequired,
    })
  ),
  xBandwidth: PropTypes.number,
  chartWidth: PropTypes.number,
  chartHeight: PropTypes.number,
  bubbleColor: PropTypes.string,
  textColor: PropTypes.string,
  fontSize: PropTypes.number,
  pointer: PropTypes.bool,
  padding: PropTypes.number,
}; 