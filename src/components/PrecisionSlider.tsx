import React from 'react';

export type PrecisionSliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  className?: string;
  thresholdScale?: number;
  precisionPower?: number;
  minPrecisionScale?: number;
  fineStepMultiplier?: number;
  pageStepMultiplier?: number;
};

type PrecisionSliderDragState = {
  pointerId: number;
  lastX: number;
  currentValue: number;
  centerY: number;
  range: number;
  trackWidth: number;
  precisionThreshold: number;
};

type PrecisionSliderStyle = React.CSSProperties & {
  '--value-pct': string;
  '--precision-scale': string;
  '--handle-scale': string;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

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

const snapToStep = (value: number, min: number, step: number): number => {
  if (!Number.isFinite(step) || step <= 0) return value;
  const precision = getStepPrecision(step);
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(precision));
};

const valueToPercent = (value: number, min: number, max: number): number => {
  if (max <= min) return 0;
  return ((clamp(value, min, max) - min) / (max - min)) * 100;
};

const pointerToValue = (
  clientX: number,
  rect: DOMRect,
  min: number,
  max: number,
  step: number
): number => {
  if (max <= min) return min;
  const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  const raw = min + ratio * (max - min);
  return snapToStep(raw, min, step);
};

const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  className = '',
  thresholdScale = 1,
  precisionPower = 1.35,
  minPrecisionScale = 0.01,
  fineStepMultiplier = 0.2,
  pageStepMultiplier = 10,
}) => {
  const sliderRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<PrecisionSliderDragState | null>(null);
  const committedValueRef = React.useRef(value);
  const [precisionScale, setPrecisionScale] = React.useState(1);

  React.useEffect(() => {
    committedValueRef.current = value;
  }, [value]);

  const valuePct = React.useMemo(() => valueToPercent(value, min, max), [value, min, max]);

  const commitValue = React.useCallback((next: number): number => {
    const snapped = snapToStep(next, min, step);
    const clamped = clamp(snapped, min, max);
    if (clamped === committedValueRef.current) return clamped;
    committedValueRef.current = clamped;
    onChange(clamped);
    return clamped;
  }, [max, min, onChange, step]);

  const releaseDrag = React.useCallback(() => {
    dragRef.current = null;
    setPrecisionScale(1);
  }, []);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' && event.button !== 0) return;

    const slider = sliderRef.current;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const initialValue = pointerToValue(event.clientX, rect, min, max, step);
    const committedValue = commitValue(initialValue);

    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      currentValue: committedValue,
      centerY: rect.top + rect.height / 2,
      range: max - min,
      trackWidth: Math.max(rect.width, 1),
      precisionThreshold: Math.max(rect.height * thresholdScale, 1),
    };

    setPrecisionScale(1);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [commitValue, max, min, step, thresholdScale]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const perpendicularDistance = Math.abs(event.clientY - drag.centerY);
    const distanceScale = perpendicularDistance <= drag.precisionThreshold
      ? 1
      : clamp(
          Math.pow(drag.precisionThreshold / perpendicularDistance, precisionPower),
          minPrecisionScale,
          1
        );

    setPrecisionScale(distanceScale);

    const horizontalDelta = event.clientX - drag.lastX;
    if (horizontalDelta === 0) return;

    const scaledDelta = (horizontalDelta / drag.trackWidth) * drag.range * distanceScale;
    const committedValue = commitValue(drag.currentValue + scaledDelta);

    drag.currentValue = committedValue;
    drag.lastX = event.clientX;
  }, [commitValue, minPrecisionScale, precisionPower]);

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseDrag();
  }, [releaseDrag]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextValue: number | null = null;
    const baseStep = event.altKey ? step * fineStepMultiplier : step;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = value - baseStep;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = value + baseStep;
    if (event.key === 'PageDown') nextValue = value - baseStep * pageStepMultiplier;
    if (event.key === 'PageUp') nextValue = value + baseStep * pageStepMultiplier;
    if (event.key === 'Home') nextValue = min;
    if (event.key === 'End') nextValue = max;

    if (nextValue === null) return;

    event.preventDefault();
    commitValue(nextValue);
  }, [commitValue, fineStepMultiplier, max, min, pageStepMultiplier, step, value]);

  const style: PrecisionSliderStyle = {
    '--value-pct': `${valuePct}%`,
    '--precision-scale': `${precisionScale}`,
    '--handle-scale': `${0.55 + precisionScale * 0.45}`,
  };

  return (
    <div
      ref={sliderRef}
      className={`tone-slider ${className}`.trim()}
      style={style}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={releaseDrag}
      onKeyDown={handleKeyDown}
    >
      <div className="tone-slider__track" aria-hidden="true" />
      <div className="tone-slider__fill" aria-hidden="true" />
      <div className="tone-slider__handle" aria-hidden="true" />
    </div>
  );
};

export default PrecisionSlider;
