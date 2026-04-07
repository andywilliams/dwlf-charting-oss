import { useCallback, useEffect, useMemo, useRef } from 'react';
import { findClosestIndex } from './annotationUtils';
import type { PaneComputedScale, XScale } from '../../charting/types';
import useAnnotationDrag from './useAnnotationDrag';

interface UsePointAnnotationDragOptions {
  annotationId: string;
  time: number;
  price: number;
  xScale: XScale;
  yScale: PaneComputedScale;
  onMove?: (id: string, newTime: number, newPrice: number) => void;
  /** Convert raw timestamp to index when compressGaps is enabled */
  timeToIndex?: (time: number) => number | undefined;
  /** Convert index back to raw timestamp when compressGaps is enabled */
  indexToTime?: (index: number) => number;
  /** Number of data points (required for closest index search when compressGaps enabled) */
  dataLength?: number;
  /** Precomputed array of raw timestamps for each compressed index */
  compressedTimes?: number[];
}

const usePointAnnotationDrag = ({
  annotationId,
  time,
  price,
  xScale,
  yScale,
  onMove,
  timeToIndex,
  indexToTime,
  dataLength = 0,
  compressedTimes,
}: UsePointAnnotationDragOptions) => {
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartCoords = useRef<{ time: number; price: number }>({ time: 0, price: 0 });
  const xScaleRef = useRef(xScale);
  const yScaleRef = useRef(yScale);
  const timeToIndexRef = useRef(timeToIndex);
  const indexToTimeRef = useRef(indexToTime);
  const dataLengthRef = useRef(dataLength);
  const compressedTimesRef = useRef<number[] | undefined>(compressedTimes);

  useEffect(() => {
    xScaleRef.current = xScale;
    yScaleRef.current = yScale;
    timeToIndexRef.current = timeToIndex;
    indexToTimeRef.current = indexToTime;
    dataLengthRef.current = dataLength;
    compressedTimesRef.current = compressedTimes;
  }, [xScale, yScale, timeToIndex, indexToTime, dataLength, compressedTimes]);

  const handleDragStart = useCallback((event: React.MouseEvent) => {
    dragStartPos.current = { x: event.clientX, y: event.clientY };
    dragStartCoords.current = { time, price };
  }, [price, time]);

  const handleDragMove = useCallback((moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - dragStartPos.current.x;
    const deltaY = moveEvent.clientY - dragStartPos.current.y;

    const xScaleCurrent = xScaleRef.current;
    const yScaleCurrent = yScaleRef.current;
    const timeToIndexCurrent = timeToIndexRef.current;
    const indexToTimeCurrent = indexToTimeRef.current;
    const dataLengthCurrent = dataLengthRef.current;
    const compressedTimesCurrent = compressedTimesRef.current;

    let startXValue = dragStartCoords.current.time;
    if (timeToIndexCurrent && indexToTimeCurrent && dataLengthCurrent > 0) {
      startXValue = findClosestIndex(
        dragStartCoords.current.time,
        compressedTimesCurrent,
        timeToIndexCurrent
      ) ?? dragStartCoords.current.time;
    }
    const newX = xScaleCurrent(startXValue) + deltaX;
    const newY = yScaleCurrent.scale(dragStartCoords.current.price) + deltaY;

    let newTime = dragStartCoords.current.time;
    if (xScaleCurrent.invert) {
      const inverted = xScaleCurrent.invert(newX);
      const rawValue = inverted instanceof Date ? inverted.getTime() : inverted as number;
      newTime = indexToTimeCurrent ? indexToTimeCurrent(Math.round(rawValue)) : rawValue;
    }
    const newPrice = yScaleCurrent.invert(newY);

    if (Number.isFinite(newTime) && Number.isFinite(newPrice)) {
      onMove?.(annotationId, newTime, newPrice);
    }
  }, [annotationId, onMove]);

  const { isDragging, handleMouseDown } = useAnnotationDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
  });

  const indexValue = useMemo(() => {
    if (timeToIndex && indexToTime && dataLength > 0) {
      return findClosestIndex(time, compressedTimes, timeToIndex);
    }
    if (timeToIndex) {
      return timeToIndex(time);
    }
    return undefined;
  }, [compressedTimes, dataLength, indexToTime, time, timeToIndex]);

  return { handleMouseDown, indexValue, isDragging };
};

export default usePointAnnotationDrag;
