export default function useChartLayout({ width, height, margin }) {
  const fullWidth = width;
  const fullHeight = height;

  const innerWidth = fullWidth - margin.left - margin.right;
  const innerHeight = fullHeight - margin.top - margin.bottom;

  return {
    margin,
    fullWidth,
    fullHeight,
    innerWidth,
    innerHeight,
    chartTransform: `translate(${margin.left}, ${margin.top})`,
  };
}
