// Explicitly export the TypeScript version of DWLFChart to avoid conflicts with DWLFChart.jsx
// TypeScript/Vite should prefer .tsx over .jsx, but this index ensures we get the right version
export { default as DWLFChart, __computeSeriesHoverForTests } from './DWLFChart';
export type { DwlfChartHandle, DWLFChartProps } from './DWLFChart';

