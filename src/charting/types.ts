export interface LinePoint {
  t: number;
  v: number;
}

export interface OhlcPoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export type Candle = OhlcPoint;

export type SeriesType = 'line' | 'hist' | 'area' | 'ohlc' | 'marker' | 'position';

export interface SeriesStyle {
  color?: string;
  lineWidth?: number;
  dashed?: boolean;
  opacity?: number;
  markerShape?: 'arrow-up' | 'arrow-down' | 'circle';
  markerSize?: number;
  markerOffsetY?: number;
  markerFontSize?: number;
  markerTextColor?: string;
  markerTextOffsetY?: number;
  /**
   * 'filled' (default) renders the marker as a solid shape.
   * 'outline' renders just the stroke (hollow ring for circles).
   */
  markerVariant?: 'filled' | 'outline';
  /**
   * Stroke width in pixels for the 'outline' variant. Defaults to 1.5.
   * Has no effect on the 'filled' variant.
   */
  markerStrokeWidth?: number;
  /**
   * If > 0, draws a soft halo (a translucent concentric circle) behind
   * the marker. The halo's outer radius is `markerSize + markerHaloSize`.
   * Defaults to 0 (no halo).
   */
  markerHaloSize?: number;
  /**
   * Opacity of the halo, 0..1. Defaults to 0.25.
   */
  markerHaloOpacity?: number;
  riskColor?: string;
  rewardColor?: string;
  bubbleColor?: string;
  textColor?: string;
  fontSize?: number;
  pointer?: boolean;
  padding?: number;
}

export type TooltipFormatter = (point: any) => string;

export interface SeriesSpec {
  key: string;
  type: SeriesType;
  data: any[];
  /** Shorthand for style.color. If both are set, style.color takes precedence. */
  color?: string;
  style?: SeriesStyle;
  tooltipFormatter?: TooltipFormatter;
  showInTooltip?: boolean;
  /**
   * Optional click handler invoked when a point belonging to this series is
   * clicked. The callback receives the raw datum found by the hit-testing
   * logic (for markers this is typically the marker datum; for OHLC, the
   * candle; for lines, the nearest LinePoint).
   *
   * Consumers should treat this as best-effort hit-testing around the
   * current crosshair time.
   */
  onClick?: (raw: any) => void;
}

export interface PaneGuide {
  y: number;
  dashed?: boolean;
  label?: string;
  color?: string;
  /**
   * Optional start time for partial-width guides (e.g., S/R lines that start
   * at their formation bar). If omitted, the guide extends from the left edge.
   */
  startTime?: number;
  /**
   * Optional end time for partial-width guides. If omitted, the guide extends
   * to the right edge.
   */
  endTime?: number;
}

export interface PaneSpec {
  id: string;
  title?: string;
  heightRatio: number;
  yScale: { mode: 'auto' | 'fixed'; min?: number; max?: number };
  series: SeriesSpec[];
  guides?: PaneGuide[];
  /**
   * When true, the pane is rendered without its right-edge y-axis tick
   * labels. Useful for "marker band" panes that show events along the
   * time axis but don't have a meaningful price/value scale to label.
   *
   * Has no effect on the pane's hover crosshair or its data — only the
   * visible tick text and tick label positioning are skipped.
   */
  hideYAxis?: boolean;
}

export interface ChartSpec {
  panes: PaneSpec[];
  timeFormatter?: (t: number) => string;
  onCrosshairMove?: (t: number) => void;
  /**
   * When true, include all series (markers, positions, overlays) when deriving
   * the automatic Y-domain for panes that contain OHLC data. By default only
   * OHLC series influence the auto-scale, while panes without OHLC series
   * continue to consider every series to avoid empty domains.
   */
  includeOverlaysInAutoScale?: boolean;
  /**
   * Optional global handler fired when the user clicks on the chart canvas
   * and a nearest series/point has been resolved. This is useful for
   * higher-level interactions (e.g. selecting a cycle-low marker) without
   * requiring every series to declare its own onClick handler.
   */
  onSeriesPointClick?: (info: {
    paneId: string;
    seriesKey: string;
    time: number;
    raw: any;
  }) => void;
}

export interface PaneComputedScale {
  domain: [number, number];
  scale: (value: number) => number;
  invert: (value: number) => number;
}

/** X-axis scale function with optional invert/range accessors */
export type XScale = ((value: number) => number) & {
  invert?: (value: number) => number | Date;
  range?: () => [number, number];
};

// ─────────────────────────────────────────────────────────────────────────────
// Chart Annotations (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationType = 'hline' | 'vline' | 'text' | 'trendline' | 'ray' | 'crossline' | 'rectangle' | 'emoji' | 'timerange' | 'arrow' | 'channel' | 'fibRetracement' | 'measure' | 'alert_line' | 'brush' | 'pitchfork' | 'fib_extension' | 'order_block' | 'fair_value_gap' | 'bos_line';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface AnnotationBase {
  id: string;
  type: AnnotationType;
  symbol: string;
  timeframe: string;
  /** Timeframes this annotation is visible on. Null/undefined/empty = visible on all. */
  visibleTimeframes?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HLineAnnotation extends AnnotationBase {
  type: 'hline';
  price: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  showPrice: boolean;
}

export interface VLineAnnotation extends AnnotationBase {
  type: 'vline';
  time: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  showTime: boolean;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  time: number;
  price: number;
  text: string;
  color: string;
  backgroundColor?: string;
  fontSize: number;
}

/** A single point in a freehand brush stroke (chart coordinates). */
export type BrushPoint = LinePoint;

/** Standard Fibonacci retracement level ratios */
export const FIB_LEVELS_DEFAULT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Optional extension levels beyond the 0–100% range */
export const FIB_EXTENSIONS_DEFAULT = [1.272, 1.618, 2.0, 2.618] as const;

export interface TrendLineAnnotation extends AnnotationBase {
  type: 'trendline';
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color?: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  label?: string;
  extendLeft: boolean;
  extendRight: boolean;
}

export interface ChannelAnnotation extends AnnotationBase {
  type: 'channel';
  /** First anchor point of the base line */
  time1: number;
  price1: number;
  /** Second anchor point of the base line */
  time2: number;
  price2: number;
  /**
   * Price offset for the parallel line. Positive = above the base line,
   * negative = below. The parallel line runs through
   * (time1, price1 + priceOffset) → (time2, price2 + priceOffset).
   */
  priceOffset: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  /** Opacity of the fill between the two parallel lines (0–1) */
  fillOpacity: number;
  extendLeft: boolean;
  extendRight: boolean;
}

export interface RayAnnotation extends AnnotationBase {
  type: 'ray';
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
}

export interface RectangleAnnotation extends AnnotationBase {
  type: 'rectangle';
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
  fillOpacity: number;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
}

export interface TimeRangeAnnotation extends AnnotationBase {
  type: 'timerange';
  time1: number;
  time2: number;
  color: string;
  fillOpacity: number;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
}

export interface CrossLineAnnotation extends AnnotationBase {
  type: 'crossline';
  time: number;
  price: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  showPrice: boolean;
  showTime: boolean;
}

export interface AlertLineAnnotation extends AnnotationBase {
  type: 'alert_line';
  price: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  showPrice: boolean;
  /** Whether the alert has been triggered */
  triggered: boolean;
  /** Direction: 'above' = alert when price crosses above, 'below' = crosses below */
  direction: 'above' | 'below';
  /** Server-side alert ID from POST /v2/alerts (set after sync) */
  alertId?: string;
}

export interface EmojiAnnotation extends AnnotationBase {
  type: 'emoji';
  time: number;
  price: number;
  emoji: string;
  size: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow';
  /** Text box / callout origin point */
  time1: number;
  price1: number;
  /** Arrow target point (arrowhead rendered here) */
  time2: number;
  price2: number;
  text: string;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  fontSize: number;
}

export interface FibRetracementAnnotation extends AnnotationBase {
  type: 'fibRetracement' | 'measure';
  /** Swing point 1 (typically the high or low where the move starts) */
  time1: number;
  price1: number;
  /** Swing point 2 (the other extreme of the move) */
  time2: number;
  price2: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  /** Opacity of the fill bands between adjacent levels (0–1) */
  fillOpacity: number;
  /** Fib ratios to display. Defaults to FIB_LEVELS_DEFAULT. */
  levels: number[];
  /** Whether to show extension levels beyond 100% */
  showExtensions: boolean;
  /** Whether to extend level lines to the right edge of the chart */
  extendRight: boolean;
}

export interface MeasureAnnotation extends AnnotationBase {
  type: 'measure';
  /** First anchor point */
  time1: number;
  price1: number;
  /** Second anchor point */
  time2: number;
  price2: number;
  color: string;
}

export interface BrushAnnotation extends AnnotationBase {
  type: 'brush';
  /** Ordered array of points forming the freehand path. */
  points: BrushPoint[];
  color: string;
  lineWidth: number;
}

/**
 * Andrew's Pitchfork — three-point tool.
 * P1 is the pivot (start of the median line).
 * P2 and P3 define the swing high/low.
 * The median line extends from P1 through the midpoint of P2–P3.
 * Upper parallel runs through P2; lower parallel runs through P3.
 */
export interface PitchforkAnnotation extends AnnotationBase {
  type: 'pitchfork';
  /** Pivot point (start of median line) */
  time1: number;
  price1: number;
  /** Second anchor (e.g., swing high) */
  time2: number;
  price2: number;
  /** Third anchor (e.g., swing low) */
  time3: number;
  price3: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  /** Opacity of the fill between upper and lower parallels (0–1) */
  fillOpacity: number;
  /** Extend lines to chart edges */
  extendRight: boolean;
}

/**
 * Fibonacci Extension — three-point tool for projecting price targets.
 * P1 is the start of the initial move (e.g., swing low).
 * P2 is the end of the initial move (e.g., swing high).
 * P3 is the end of the retracement (e.g., pullback low).
 * Extension levels are projected from P3 using the P1→P2 move distance.
 */
export interface FibExtensionAnnotation extends AnnotationBase {
  type: 'fib_extension';
  /** Start of initial move */
  time1: number;
  price1: number;
  /** End of initial move */
  time2: number;
  price2: number;
  /** End of retracement */
  time3: number;
  price3: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: number;
  label?: string;
  /** Extension levels to display (e.g., [0, 0.618, 1, 1.272, 1.618, 2, 2.618]) */
  levels: number[];
  /** Opacity of the fill between levels (0–1) */
  fillOpacity: number;
  /** Show price labels on each level */
  showPrices: boolean;
}

/**
 * SMC Order Block — a zone where institutional activity occurred.
 * Rendered as a shaded price zone between low and high of the block candle.
 */
export interface OrderBlockAnnotation extends AnnotationBase {
  type: 'order_block';
  /** Time of the order block candle */
  time: number;
  /** High price of the order block candle */
  high: number;
  /** Low price of the order block candle */
  low: number;
  /** Direction: bullish (green) or bearish (red) */
  direction: 'bullish' | 'bearish';
  /** Current state of the order block */
  state: 'active' | 'tested' | 'mitigated';
  /** Color (auto-computed from direction if not provided) */
  color?: string;
  /** Fill opacity (0-1) */
  fillOpacity: number;
  /** Border line style */
  lineStyle: LineStyle;
  /** Border line width */
  lineWidth: number;
  /** Optional label (e.g., "OB", "Buy OB") */
  label?: string;
}

/**
 * SMC Fair Value Gap — the unfilled gap between three consecutive candles.
 * The gap is between the low of the middle candle and high of the adjacent candle.
 */
export interface FairValueGapAnnotation extends AnnotationBase {
  type: 'fair_value_gap';
  /** Time of the first candle (left side of gap) */
  time1: number;
  /** Time of the third candle (right side of gap) */
  time2: number;
  /** Top of the FVG zone (high of candle1 vs candle3, whichever is higher) */
  top: number;
  /** Bottom of the FVG zone (low of candle1 vs candle3, whichever is lower) */
  bottom: number;
  /** Direction: bullish (green) or bearish (red) */
  direction: 'bullish' | 'bearish';
  /** Whether the FVG has been filled (mitigated) */
  filled: boolean;
  /** Color (auto-computed from direction if not provided) */
  color?: string;
  /** Fill opacity (0-1) */
  fillOpacity: number;
  /** Border line style */
  lineStyle: LineStyle;
  /** Border line width */
  lineWidth: number;
  /** Optional label (e.g., "FVG") */
  label?: string;
}

/**
 * SMC BOS (Break of Structure) or ChoCH (Change of Character) level line.
 * A horizontal line at the level where price broke a structure.
 */
export interface BosLineAnnotation extends AnnotationBase {
  type: 'bos_line';
  /** Time at which the break occurred */
  time: number;
  /** Price level of the break */
  price: number;
  /** Type: BOS or ChoCH */
  bosType: 'BOS' | 'ChoCH';
  /** Direction: bullish (green) or bearish (red) */
  direction: 'bullish' | 'bearish';
  /** Whether this is a confirmed break (vs pending) */
  confirmed: boolean;
  /** Color (auto-computed from direction if not provided) */
  color?: string;
  /** Line style */
  lineStyle: LineStyle;
  /** Line width */
  lineWidth: number;
  /** Show price label */
  showPrice: boolean;
  /** Show type label (BOS/ChoCH) */
  showLabel: boolean;
}

export type Annotation = HLineAnnotation | VLineAnnotation | TextAnnotation | TrendLineAnnotation | RayAnnotation | CrossLineAnnotation | RectangleAnnotation | EmojiAnnotation | TimeRangeAnnotation | ArrowAnnotation | ChannelAnnotation | FibRetracementAnnotation | MeasureAnnotation | AlertLineAnnotation | BrushAnnotation | PitchforkAnnotation | FibExtensionAnnotation | OrderBlockAnnotation | FairValueGapAnnotation | BosLineAnnotation;// v1.1.1
