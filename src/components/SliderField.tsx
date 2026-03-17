import React from 'react';
import PrecisionSlider, { PrecisionSliderProps } from './PrecisionSlider';

interface SliderFieldProps extends Omit<PrecisionSliderProps, 'className'> {
  label: React.ReactNode;
  valueText?: React.ReactNode;
  valueFormatter?: (value: number) => string;
  showBounds?: boolean;
  minLabel?: React.ReactNode;
  maxLabel?: React.ReactNode;
  className?: string;
  sliderClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  boundsClassName?: string;
}

const joinClasses = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(' ');

const SliderField: React.FC<SliderFieldProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  thresholdScale,
  precisionPower,
  minPrecisionScale,
  fineStepMultiplier,
  pageStepMultiplier,
  valueText,
  valueFormatter,
  showBounds = false,
  minLabel,
  maxLabel,
  className,
  sliderClassName,
  labelClassName = 'text-gray-400',
  valueClassName = 'font-mono text-gray-300',
  boundsClassName = 'text-[10px] text-gray-600',
}) => {
  const resolvedValueText = valueText ?? valueFormatter?.(value) ?? String(value);

  return (
    <div className={joinClasses('space-y-2', className)}>
      <div className="flex justify-between">
        <span className={labelClassName}>{label}</span>
        <span className={valueClassName}>{resolvedValueText}</span>
      </div>
      <PrecisionSlider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        ariaLabel={ariaLabel}
        thresholdScale={thresholdScale}
        precisionPower={precisionPower}
        minPrecisionScale={minPrecisionScale}
        fineStepMultiplier={fineStepMultiplier}
        pageStepMultiplier={pageStepMultiplier}
        className={sliderClassName}
      />
      {showBounds && (
        <div className={joinClasses('flex justify-between', boundsClassName)}>
          <span>{minLabel ?? min}</span>
          <span>{maxLabel ?? max}</span>
        </div>
      )}
    </div>
  );
};

export default SliderField;
