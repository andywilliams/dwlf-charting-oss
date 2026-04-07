import { useCallback, useMemo, useState } from 'react';

function useOverlayToggles(sampleData, smaData = {}) {
  const definitionsMap = useMemo(() => {
    return overlayDefinitions.reduce((acc, def) => {
      acc[def.id] = def;
      return acc;
    }, {});
  }, []);

  const [activeKeys, setActiveKeys] = useState(new Set());

  const toggleOverlay = useCallback((key) => {
    setActiveKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const overlays = useMemo(() => {
    return Array.from(activeKeys)
      .map(key => {
        const def = definitionsMap[key];
        return def?.generator(sampleData, smaData);
      })
      .filter(Boolean);
  }, [activeKeys, definitionsMap, sampleData, smaData]);

  const isOverlayActive = useCallback(
    (key) => activeKeys.has(key),
    [activeKeys]
  );

  const toggleOverlayById = (id) => {
    toggleOverlay(id);
  };

  return {
    overlayDefinitions: definitionsMap,
    activeKeys,
    overlays,
    toggleOverlay,
    toggleOverlayById,
    isOverlayActive,
  };
}

export const overlayDefinitions = [
  {
    id: 'sma20',
    label: 'SMA 20',
    generator: (data, smaData) => ({
      type: 'line',
      label: 'sma20',
      data: smaData.sma20 || [],
      color: 'orange',
    }),
  },
  {
    id: 'sma50',
    label: 'SMA 50',
    generator: (data, smaData) => ({
      type: 'line',
      label: 'sma50',
      data: smaData.sma50 || [],
      color: 'blue',
    }),
  },
];

export default useOverlayToggles;
