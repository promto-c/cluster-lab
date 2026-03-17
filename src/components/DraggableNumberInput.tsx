import React from 'react';
import { MoveHorizontal } from 'lucide-react';

export interface DraggableNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  handleClassName?: string;
  ariaLabel: string;
  title?: string;
  thresholdScale?: number;
  precisionPower?: number;
  minPrecisionScale?: number;
  fineStepMultiplier?: number;
  pageStepMultiplier?: number;
  dragPixelsPerStep?: number;
}

type DragState = {
  pointerId: number;
  lastX: number;
  centerY: number;
  currentValue: number;
  precisionThreshold: number;
};

type DraggableNumberStyle = React.CSSProperties & {
  '--precision-scale': string;
};

const joinClasses = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const isFiniteNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseDraftNumber = (draft: string): number | null => {
  const trimmed = draft.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const TRACKPAD_PIXELS_PER_STEP = 40;
const MOUSE_WHEEL_PIXEL_DELTA_CUTOFF = 100;
const MOUSE_WHEEL_PIXELS_PER_STEP = 120;
const WHEEL_LINES_PER_STEP = 3;

const normalizeWheelDelta = (event: React.WheelEvent): number => {
  if (event.deltaMode === 1) {
    return event.deltaY / WHEEL_LINES_PER_STEP;
  }
  if (event.deltaMode === 2) {
    return event.deltaY;
  }

  const pixelDelta = event.deltaY;
  const absPixelDelta = Math.abs(pixelDelta);

  // Most mouse wheels send a large discrete pixel delta (commonly 100-120).
  // Snap those to whole steps so `step` maps 1:1 with one wheel notch.
  if (absPixelDelta >= MOUSE_WHEEL_PIXEL_DELTA_CUTOFF) {
    const wheelSteps = Math.max(1, Math.round(absPixelDelta / MOUSE_WHEEL_PIXELS_PER_STEP));
    return Math.sign(pixelDelta) * wheelSteps;
  }

  // Trackpads usually emit many small deltas, so keep accumulation smooth.
  return pixelDelta / TRACKPAD_PIXELS_PER_STEP;
};

const getStepPrecision = (step: number): number => {
  const text = String(step).toLowerCase();
  if (!text.includes('e-')) {
    const dot = text.indexOf('.');
    return dot >= 0 ? text.length - dot - 1 : 0;
  }

  const [base, exponentText] = text.split('e-');
  const exponent = Number.parseInt(exponentText ?? '0', 10);
  const dot = base.indexOf('.');
  const basePrecision = dot >= 0 ? base.length - dot - 1 : 0;
  return basePrecision + exponent;
};

const snapToStep = (value: number, anchor: number, step: number): number => {
  if (!Number.isFinite(step) || step <= 0) return value;
  const precision = getStepPrecision(step);
  const snapped = anchor + Math.round((value - anchor) / step) * step;
  return Number(snapped.toFixed(Math.min(precision + 2, 10)));
};

const DraggableNumberInput: React.FC<DraggableNumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  integer = Number.isInteger(step),
  disabled = false,
  className,
  inputClassName,
  handleClassName,
  ariaLabel,
  title,
  thresholdScale = 1.6,
  precisionPower = 1.35,
  minPrecisionScale = 0.02,
  fineStepMultiplier = 0.2,
  pageStepMultiplier = 10,
  dragPixelsPerStep = 10,
}) => {
  const dragRef = React.useRef<DragState | null>(null);
  const wheelAccumulatorRef = React.useRef(0);
  const committedValueRef = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [precisionScale, setPrecisionScale] = React.useState(1);

  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const minBound = isFiniteNumber(min) ? min : -Infinity;
  const maxBound = isFiniteNumber(max) ? max : Infinity;
  const stepAnchor = isFiniteNumber(min) ? min : 0;

  const sanitize = React.useCallback(
    (raw: number): number => {
      if (!Number.isFinite(raw)) {
        return committedValueRef.current;
      }

      const snapped = snapToStep(raw, stepAnchor, safeStep);
      const rounded = integer ? Math.round(snapped) : snapped;
      return clamp(rounded, minBound, maxBound);
    },
    [integer, maxBound, minBound, safeStep, stepAnchor],
  );

  const formatValue = React.useCallback(
    (next: number): string => {
      if (!Number.isFinite(next)) return '';
      if (integer) return String(Math.round(next));

      const precision = getStepPrecision(safeStep);
      return Number(next.toFixed(Math.min(precision + 2, 10))).toString();
    },
    [integer, safeStep],
  );

  const normalizedValue = React.useMemo(() => {
    const fallback = Number.isFinite(minBound) ? minBound : 0;
    const base = Number.isFinite(value) ? value : fallback;
    return sanitize(base);
  }, [minBound, sanitize, value]);

  const [draft, setDraft] = React.useState(() => formatValue(normalizedValue));

  React.useEffect(() => {
    committedValueRef.current = normalizedValue;
    if (!isFocused && !isDragging) {
      setDraft(formatValue(normalizedValue));
    }
  }, [formatValue, isDragging, isFocused, normalizedValue]);

  const commitValue = React.useCallback(
    (raw: number): number => {
      const next = sanitize(raw);
      const prev = committedValueRef.current;
      committedValueRef.current = next;
      if (next !== prev) {
        onChange(next);
      }
      return next;
    },
    [onChange, sanitize],
  );

  const commitDraft = React.useCallback(() => {
    const parsed = parseDraftNumber(draft);
    if (parsed === null) {
      setDraft(formatValue(committedValueRef.current));
      return;
    }

    const committed = commitValue(parsed);
    setDraft(formatValue(committed));
  }, [commitValue, draft, formatValue]);

  const nudgeValue = React.useCallback(
    (delta: number) => {
      const parsedDraft = parseDraftNumber(draft);
      const source = parsedDraft ?? committedValueRef.current;
      const next = commitValue(source + delta);
      setDraft(formatValue(next));
    },
    [commitValue, draft, formatValue],
  );

  const releaseDrag = React.useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    setPrecisionScale(1);
  }, []);

  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (disabled || !isFocused) return;
      if (event.deltaY === 0) return;

      event.preventDefault();

      const baseStep = safeStep * (event.altKey ? fineStepMultiplier : 1) * (event.shiftKey ? pageStepMultiplier : 1);

      if (!Number.isFinite(baseStep) || baseStep === 0) return;

      wheelAccumulatorRef.current += normalizeWheelDelta(event);
      const direction = wheelAccumulatorRef.current < 0 ? 1 : -1;
      const steps = Math.trunc(Math.abs(wheelAccumulatorRef.current));
      if (steps <= 0) return;

      nudgeValue(direction * baseStep * steps);

      if (wheelAccumulatorRef.current < 0) {
        wheelAccumulatorRef.current += steps;
      } else {
        wheelAccumulatorRef.current -= steps;
      }
    },
    [disabled, fineStepMultiplier, isFocused, nudgeValue, pageStepMultiplier, safeStep],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (event.pointerType !== 'touch' && event.button !== 0) return;

      const handle = event.currentTarget;
      const rect = handle.getBoundingClientRect();
      const parsedDraft = parseDraftNumber(draft);
      const startValue = parsedDraft !== null ? sanitize(parsedDraft) : committedValueRef.current;
      const committedStart = commitValue(startValue);

      setDraft(formatValue(committedStart));
      setIsFocused(false);
      inputRef.current?.blur();

      dragRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        centerY: rect.top + rect.height / 2,
        currentValue: committedStart,
        precisionThreshold: Math.max(rect.height * thresholdScale, 1),
      };

      setIsDragging(true);
      setPrecisionScale(1);
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [commitValue, disabled, draft, formatValue, sanitize, thresholdScale],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const verticalDistance = Math.abs(event.clientY - drag.centerY);
      const precision =
        verticalDistance <= drag.precisionThreshold
          ? 1
          : clamp(Math.pow(drag.precisionThreshold / verticalDistance, precisionPower), minPrecisionScale, 1);

      setPrecisionScale(precision);

      const deltaX = event.clientX - drag.lastX;
      if (deltaX === 0) return;

      const scaledDelta = (deltaX / Math.max(dragPixelsPerStep, 1)) * safeStep * precision;
      const committed = commitValue(drag.currentValue + scaledDelta);

      drag.currentValue = committed;
      drag.lastX = event.clientX;
      setDraft(formatValue(committed));
    },
    [commitValue, dragPixelsPerStep, formatValue, minPrecisionScale, precisionPower, safeStep],
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      releaseDrag();
    },
    [releaseDrag],
  );

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        commitDraft();
        inputRef.current?.blur();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setDraft(formatValue(committedValueRef.current));
        inputRef.current?.blur();
        return;
      }

      const baseStep = event.altKey ? safeStep * fineStepMultiplier : safeStep;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        nudgeValue(baseStep);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        nudgeValue(-baseStep);
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        nudgeValue(baseStep * pageStepMultiplier);
        return;
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        nudgeValue(-baseStep * pageStepMultiplier);
        return;
      }
      if (event.key === 'Home' && Number.isFinite(minBound)) {
        event.preventDefault();
        const committed = commitValue(minBound);
        setDraft(formatValue(committed));
        return;
      }
      if (event.key === 'End' && Number.isFinite(maxBound)) {
        event.preventDefault();
        const committed = commitValue(maxBound);
        setDraft(formatValue(committed));
      }
    },
    [
      commitDraft,
      commitValue,
      disabled,
      fineStepMultiplier,
      formatValue,
      maxBound,
      minBound,
      nudgeValue,
      pageStepMultiplier,
      safeStep,
    ],
  );

  const style: DraggableNumberStyle = {
    '--precision-scale': `${precisionScale}`,
  };

  return (
    <div
      className={joinClasses('draggable-number', disabled && 'is-disabled', className)}
      style={style}
      onWheel={handleWheel}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          wheelAccumulatorRef.current = 0;
          setIsFocused(true);
        }}
        onBlur={() => {
          wheelAccumulatorRef.current = 0;
          setIsFocused(false);
          commitDraft();
        }}
        onKeyDown={handleInputKeyDown}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        className={joinClasses('draggable-number__input', inputClassName)}
      />
      <button
        type="button"
        aria-label={`${ariaLabel} scrub handle`}
        title={title ?? 'Drag left/right to adjust. Move pointer away vertically for finer control.'}
        disabled={disabled}
        className={joinClasses('draggable-number__handle', isDragging && 'is-active', handleClassName)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={releaseDrag}
      >
        <MoveHorizontal className="w-3 h-3" />
      </button>
    </div>
  );
};

export default DraggableNumberInput;
