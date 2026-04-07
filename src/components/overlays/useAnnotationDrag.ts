import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

type DragStartHandler = (event: ReactMouseEvent) => void;
type DragMoveHandler = (event: MouseEvent) => void;
type DragEndHandler = () => void;
type DragStartCheck = (event: ReactMouseEvent) => boolean;

interface UseAnnotationDragOptions {
  onDragMove: DragMoveHandler;
  onDragStart?: DragStartHandler;
  onDragEnd?: DragEndHandler;
  shouldStart?: DragStartCheck;
  stopPropagation?: boolean;
  preventDefault?: boolean;
}

const DEFAULT_SHOULD_START: DragStartCheck = (event) => event.button === 0;

const useAnnotationDrag = ({
  onDragMove,
  onDragStart,
  onDragEnd,
  shouldStart = DEFAULT_SHOULD_START,
  stopPropagation = true,
  preventDefault = true,
}: UseAnnotationDragOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onDragMoveRef = useRef(onDragMove);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    onDragMoveRef.current = onDragMove;
  }, [onDragMove]);

  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);

  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    if (!shouldStart(event)) return;
    if (stopPropagation) event.stopPropagation();
    if (preventDefault) event.preventDefault();
    cleanupRef.current?.();

    setIsDragging(true);
    onDragStartRef.current?.(event);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onDragMoveRef.current(moveEvent);
    };

    const cleanup = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
      onDragEndRef.current?.();
    };

    const handleMouseUp = () => {
      cleanup();
    };

    cleanupRef.current = cleanup;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [preventDefault, shouldStart, stopPropagation]);

  return { isDragging, handleMouseDown };
};

export default useAnnotationDrag;
