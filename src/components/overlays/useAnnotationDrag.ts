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

    const startX = event.clientX;
    const startY = event.clientY;
    // Movement threshold (pixels). Below this we treat the gesture as a click,
    // not a drag — so click-to-select still fires on annotations whose body
    // wires up onMouseDown unconditionally (e.g. Measure's whole-drag rect).
    const MOVE_THRESHOLD = 4;
    let didMove = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!didMove) {
        const dx = Math.abs(moveEvent.clientX - startX);
        const dy = Math.abs(moveEvent.clientY - startY);
        if (dx + dy < MOVE_THRESHOLD) return;
        didMove = true;
      }
      onDragMoveRef.current(moveEvent);
    };

    const cleanup = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
      onDragEndRef.current?.();
    };

    // Swallow the click event the browser synthesizes after mouseup so a drag
    // that lands over the chart background doesn't trigger a deselect. Only
    // suppress when the gesture *actually* moved past the threshold — a quick
    // click without movement should still bubble normally so click-to-select
    // works on bodies that wire onMouseDown unconditionally.
    const swallowNextClick = (clickEvent: MouseEvent) => {
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
      window.removeEventListener('click', swallowNextClick, true);
    };

    const handleMouseUp = () => {
      if (didMove) {
        window.addEventListener('click', swallowNextClick, true);
        // Safety: drop the listener on the next tick if no click ever fires
        // (e.g. mouseup off-window), so it can't leak across drags.
        setTimeout(() => {
          window.removeEventListener('click', swallowNextClick, true);
        }, 0);
      }
      cleanup();
    };

    cleanupRef.current = cleanup;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [preventDefault, shouldStart, stopPropagation]);

  return { isDragging, handleMouseDown };
};

export default useAnnotationDrag;
