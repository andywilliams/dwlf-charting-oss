import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * MarkerOverlay renders symbols (arrows, circles, etc.) at specific date/price points on the chart.
 *
 * props:
 * - points : Array<{ date: string | Date, price: number, tooltip?: string }>
 * - xScale : d3 scaleTime – maps dates => x coord
 * - yScale : d3 scaleLinear – maps prices => y coord
 * - xBandwidth : number – candle width, used to centre markers over candlesticks
 * - shape : 'arrow-up' | 'arrow-down' | 'circle' | 'none'
 * - size : number – base size of the marker in px
 * - color : string – fill / stroke colour
 * - offsetY : number – Y-offset in px to fine-tune vertical placement (positive => down)
 * - text : string – optional text label for the marker
 * - fontSize : number – optional font size for the text label
 * - textColor : string – optional text color for the label
 * - textOffsetY : number – optional Y-offset for the text label
 * - variant : 'filled' (default) | 'outline' – fill style. 'outline' draws
 *     just the stroke for a hollow ring effect on circles.
 * - strokeWidth : number – stroke width for the 'outline' variant (default 1.5)
 * - haloSize : number – if > 0, draws a soft halo (translucent concentric
 *     circle) behind the marker. Outer radius = size + haloSize.
 * - haloOpacity : number – opacity of the halo (default 0.25)
 * - onMarkerClick : function – optional click handler (receives point data)
 * - animationPhase : string – current animation phase for drop-in effects
 * - staggerDelay : number – delay in ms between each marker animation
 * - staggerStartIndex : number – base index offset for staggered animation
 */
export default function MarkerOverlay({
  points = [],
  xScale,
  yScale,
  xBandwidth = 0,
  shape = 'arrow-up',
  size = 6,
  color = 'black',
  offsetY = 0,
  text,
  fontSize = 10,
  textColor = color,
  textOffsetY = 0,
  variant = 'filled',
  strokeWidth = 1.5,
  haloSize = 0,
  haloOpacity = 0.25,
  onMarkerClick,
  animationPhase,
  staggerDelay = 100,
  staggerStartIndex = 0,
}) {
  const [activeTooltip, setActiveTooltip] = useState(null);
  const tooltipRef = useRef(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setActiveTooltip(null);
      }
    };
    if (activeTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeTooltip]);

  if (!points || points.length === 0) return null;

  const renderMarker = (cx, cy, key, hasTooltip) => {
    const cursor = hasTooltip ? 'pointer' : 'default';
    if (shape === 'arrow-up') {
      // Upwards pointing triangle (tip at cy). Arrows ignore variant/
      // halo for now — they're always filled and have no halo concept.
      const path = `M ${cx} ${cy} l ${-size} ${size} l ${2 * size} 0 Z`;
      return <path key={key} d={path} fill={color} stroke={color} style={{ cursor }} />;
    }
    if (shape === 'arrow-down') {
      // Downwards pointing triangle (tip at cy)
      const path = `M ${cx} ${cy} l ${size} ${-size} l ${-2 * size} 0 Z`;
      return <path key={key} d={path} fill={color} stroke={color} style={{ cursor }} />;
    }
    if (shape === 'none') {
      // No shape, just return null (text label will still render)
      return null;
    }
    // Default: circle. Supports two variants and an optional halo:
    //   - 'filled' (default) renders a solid disc.
    //   - 'outline' renders just a stroked ring (hollow).
    //   - haloSize > 0 draws a soft translucent halo behind the dot,
    //     useful for drawing the eye to discrete points without making
    //     the marker itself dominant.
    const isOutline = variant === 'outline';
    const elements = [];
    if (haloSize > 0) {
      elements.push(
        <circle
          key={`${key}-halo`}
          cx={cx}
          cy={cy}
          r={size + haloSize}
          fill={color}
          opacity={haloOpacity}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />,
      );
    }
    if (isOutline) {
      elements.push(
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={size}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          style={{ cursor }}
        />,
      );
    } else {
      elements.push(
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={size}
          fill={color}
          stroke={color}
          style={{ cursor }}
        />,
      );
    }
    // React 16+ accepts an array as a child of <g> — keys above keep
    // it stable across re-renders.
    return elements;
  };

  const handleMarkerClick = (point, cx, cy) => {
    if (point.tooltip) {
      setActiveTooltip({ point, cx, cy });
    }
    if (onMarkerClick) {
      onMarkerClick(point);
    }
  };

  // Hide markers until events phase; show with animation during events, always visible after complete
  const isAnimating = animationPhase && animationPhase !== 'events' && animationPhase !== 'annotations' && animationPhase !== 'complete';
  if (isAnimating) {
    return null; // Don't render markers during idle/background/candles/indicators phases
  }
  const overlayClass = animationPhase === 'events' ? 'marker-overlay marker-overlay-animated' : 'marker-overlay';
  
  return (
    <g className={overlayClass}>
      {points.map((p, idx) => {
        let domainValue;
        if (typeof p.date === 'number') {
          domainValue = p.date;
        } else if (p.date instanceof Date) {
          domainValue = p.date;
        } else {
          domainValue = new Date(p.date);
        }
        const cx = xScale(domainValue);
        const cy = yScale(p.price) + offsetY;

        const label = p.text || text;
        const labelY = cy + size + 4 + textOffsetY; // below marker by default
        const hasTooltip = !!p.tooltip;

        // Calculate staggered animation delay
        const orderIndex = Number.isFinite(p.animationOrder) ? p.animationOrder : (staggerStartIndex + idx);
        const animationDelay = animationPhase === 'events' ? orderIndex * staggerDelay : 0;
        const markerStyle = {
          cursor: hasTooltip ? 'pointer' : 'default',
          animationDelay: animationPhase === 'events' ? `${animationDelay}ms` : undefined,
        };

        return (
          <g 
            key={idx} 
            className={animationPhase === 'events' ? 'dwlf-marker-drop' : ''}
            onClick={hasTooltip ? () => handleMarkerClick(p, cx, cy) : undefined}
            style={markerStyle}
          >
            {renderMarker(cx, cy, `marker-${idx}`, hasTooltip)}
            {label && (
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fontSize={fontSize}
                fill={textColor}
                style={{ 
                  cursor: hasTooltip ? 'pointer' : 'default', 
                  pointerEvents: hasTooltip ? 'auto' : 'none',
                }}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* Tooltip popup */}
      {activeTooltip && (
        <g ref={tooltipRef}>
          <foreignObject
            x={activeTooltip.cx - 150}
            y={activeTooltip.cy - 120}
            width={300}
            height={100}
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#f5f5f5',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                lineHeight: '1.4',
                maxHeight: '90px',
                overflow: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                wordWrap: 'break-word',
              }}
            >
              {activeTooltip.point.tooltip}
            </div>
          </foreignObject>
        </g>
      )}
    </g>
  );
}

MarkerOverlay.propTypes = {
  points: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
      price: PropTypes.number.isRequired,
      text: PropTypes.string,
      tooltip: PropTypes.string,
    })
  ),
  xScale: PropTypes.func.isRequired,
  yScale: PropTypes.func.isRequired,
  xBandwidth: PropTypes.number,
  shape: PropTypes.oneOf(['arrow-up', 'arrow-down', 'circle', 'none']),
  size: PropTypes.number,
  color: PropTypes.string,
  offsetY: PropTypes.number,
  text: PropTypes.string,
  fontSize: PropTypes.number,
  textColor: PropTypes.string,
  textOffsetY: PropTypes.number,
  variant: PropTypes.oneOf(['filled', 'outline']),
  strokeWidth: PropTypes.number,
  haloSize: PropTypes.number,
  haloOpacity: PropTypes.number,
  onMarkerClick: PropTypes.func,
  animationPhase: PropTypes.string,
  staggerDelay: PropTypes.number,
  staggerStartIndex: PropTypes.number,
};
