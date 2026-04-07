// Main component export
export { default as DWLFChart } from './components/DWLFChart';
export type { DwlfChartHandle, DWLFChartProps, AxisColorConfig } from './components/DWLFChart';

// Core chart types
export type {
  Candle,
  ChartSpec,
  LinePoint,
  OhlcPoint,
  PaneGuide,
  PaneSpec,
  SeriesSpec,
  SeriesType,
  SeriesStyle,
  TooltipFormatter,
  PaneComputedScale,
  // Annotation types
  AnnotationType,
  LineStyle,
  AnnotationBase,
  HLineAnnotation,
  VLineAnnotation,
  TextAnnotation,
  TrendLineAnnotation,
  RayAnnotation,
  CrossLineAnnotation,
  RectangleAnnotation,
  EmojiAnnotation,
  TimeRangeAnnotation,
  ArrowAnnotation,
  ChannelAnnotation,
  FibRetracementAnnotation,
  MeasureAnnotation,
  AlertLineAnnotation,
  BrushPoint,
  BrushAnnotation,
  PitchforkAnnotation,
  FibExtensionAnnotation,
  OrderBlockAnnotation,
  FairValueGapAnnotation,
  BosLineAnnotation,
  Annotation,
} from './charting/types';

export { FIB_LEVELS_DEFAULT, FIB_EXTENSIONS_DEFAULT } from './charting/types';

// Hook exports
export { default as useCandlestickChart } from './hooks/useCandlestickChart.js';
export { default as useChartLayout } from './hooks/useChartLayout.js';
export { default as useChartPanZoom } from './hooks/useChartPanZoom.js';
export { default as useChartPanZoomVirtual } from './hooks/useChartPanZoomVirtual.js';
export { default as useContainerSize } from './hooks/useContainerSize.js';
export { default as useOverlayToggles } from './hooks/useOverlayToggles.js';
export { default as useChartAnimations, INDICATOR_ANIMATION_ORDER } from './hooks/useChartAnimations';
export type {
  ChartAnimationPhase,
  ChartAnimationState,
  ChartAnimationControls,
  UseChartAnimationsOptions,
} from './hooks/useChartAnimations';

// Utility exports
export * from './utils/indicators.js';

// Chart Annotations
export { default as AnnotationLayer } from './components/overlays/AnnotationLayer';
export {
  createHLineAnnotation,
  createVLineAnnotation,
  createTextAnnotation,
  createTrendLineAnnotation,
  createRayAnnotation,
  createCrossLineAnnotation,
  createRectangleAnnotation,
  createEmojiAnnotation,
  createTimeRangeAnnotation,
  createArrowAnnotation,
  createChannelAnnotation,
  createFibRetracementAnnotation,
  createMeasureAnnotation,
  createAlertLineAnnotation,
  createBrushAnnotation,
  createPitchforkAnnotation,
  createFibExtensionAnnotation,
  createOrderBlockAnnotation,
  createFairValueGapAnnotation,
  createBosLineAnnotation,
  ANNOTATION_COLORS,
} from './components/overlays/AnnotationLayer';
export type { AnnotationLayerProps } from './components/overlays/AnnotationLayer';
export { default as HLineAnnotationView } from './components/overlays/HLineAnnotationView';
export type { HLineAnnotationViewProps } from './components/overlays/HLineAnnotationView';
export { default as VLineAnnotationView } from './components/overlays/VLineAnnotationView';
export type { VLineAnnotationViewProps } from './components/overlays/VLineAnnotationView';
export { default as TextAnnotationView } from './components/overlays/TextAnnotationView';
export type { TextAnnotationViewProps } from './components/overlays/TextAnnotationView';
export { default as TrendLineAnnotationView } from './components/overlays/TrendLineAnnotationView';
export type { TrendLineAnnotationViewProps } from './components/overlays/TrendLineAnnotationView';
export { default as RayAnnotationView } from './components/overlays/RayAnnotationView';
export type { RayAnnotationViewProps } from './components/overlays/RayAnnotationView';
export { default as CrossLineAnnotationView } from './components/overlays/CrossLineAnnotationView';
export type { CrossLineAnnotationViewProps } from './components/overlays/CrossLineAnnotationView';
export { default as RectangleAnnotationView } from './components/overlays/RectangleAnnotationView';
export type { RectangleAnnotationViewProps } from './components/overlays/RectangleAnnotationView';
export { default as EmojiAnnotationView } from './components/overlays/EmojiAnnotationView';
export type { EmojiAnnotationViewProps } from './components/overlays/EmojiAnnotationView';
export { default as TimeRangeAnnotationView } from './components/overlays/TimeRangeAnnotationView';
export type { TimeRangeAnnotationViewProps } from './components/overlays/TimeRangeAnnotationView';
export { default as ArrowAnnotationView } from './components/overlays/ArrowAnnotationView';
export type { ArrowAnnotationViewProps } from './components/overlays/ArrowAnnotationView';
export { default as ChannelAnnotationView } from './components/overlays/ChannelAnnotationView';
export type { ChannelAnnotationViewProps } from './components/overlays/ChannelAnnotationView';
export { default as FibRetracementAnnotationView } from './components/overlays/FibRetracementAnnotationView';
export type { FibRetracementAnnotationViewProps } from './components/overlays/FibRetracementAnnotationView';
export { default as MeasureAnnotationView } from './components/overlays/MeasureAnnotationView';
export type { MeasureAnnotationViewProps } from './components/overlays/MeasureAnnotationView';
export { default as AlertLineAnnotationView } from './components/overlays/AlertLineAnnotationView';
export type { AlertLineAnnotationViewProps } from './components/overlays/AlertLineAnnotationView';
export { default as BrushAnnotationView } from './components/overlays/BrushAnnotationView';
export type { BrushAnnotationViewProps } from './components/overlays/BrushAnnotationView';
export { default as PitchforkAnnotationView } from './components/overlays/PitchforkAnnotationView';
export type { PitchforkAnnotationViewProps } from './components/overlays/PitchforkAnnotationView';
export { default as FibExtensionAnnotationView } from './components/overlays/FibExtensionAnnotationView';
export type { FibExtensionAnnotationViewProps } from './components/overlays/FibExtensionAnnotationView';
export { default as OrderBlockAnnotationView } from './components/overlays/OrderBlockAnnotationView';
export type { OrderBlockAnnotationViewProps } from './components/overlays/OrderBlockAnnotationView';
export { default as FairValueGapAnnotationView } from './components/overlays/FairValueGapAnnotationView';
export type { FairValueGapAnnotationViewProps } from './components/overlays/FairValueGapAnnotationView';
export { default as BosLineAnnotationView } from './components/overlays/BosLineAnnotationView';
export type { BosLineAnnotationViewProps } from './components/overlays/BosLineAnnotationView';
