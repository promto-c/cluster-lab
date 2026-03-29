import React from 'react';

type SelectionValue = string | number;

const joinClasses = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export interface SegmentedControlOption<T extends SelectionValue> {
  value: T;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
}

interface SegmentedControlProps<T extends SelectionValue> {
  ariaLabel: string;
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  inactiveButtonClassName?: string;
}

const SEGMENTED_CONTROL_BUTTON_CLASS =
  'rounded-md border text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 disabled:cursor-not-allowed disabled:opacity-40';

const SEGMENTED_CONTROL_ACTIVE_BUTTON_CLASS = 'border-accent-400/30 bg-accent-500/10 text-white shadow-sm';

const SEGMENTED_CONTROL_INACTIVE_BUTTON_CLASS =
  'border-transparent text-gray-500 hover:border-gray-700 hover:bg-gray-900/70 hover:text-gray-300';

export function SegmentedControl<T extends SelectionValue>({
  ariaLabel,
  value,
  options,
  onChange,
  className = '',
  buttonClassName = '',
  activeButtonClassName = SEGMENTED_CONTROL_ACTIVE_BUTTON_CLASS,
  inactiveButtonClassName = SEGMENTED_CONTROL_INACTIVE_BUTTON_CLASS,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={option.disabled}
            aria-pressed={isSelected}
            title={option.title}
            onClick={() => {
              if (!option.disabled) onChange(option.value);
            }}
            className={joinClasses(
              SEGMENTED_CONTROL_BUTTON_CLASS,
              buttonClassName,
              isSelected ? activeButtonClassName : inactiveButtonClassName,
              option.className,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface SelectableSwatchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isSelected: boolean;
  selectedClassName?: string;
  unselectedClassName?: string;
}

const SELECTABLE_SWATCH_BUTTON_CLASS =
  'border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30';

const SELECTABLE_SWATCH_SELECTED_CLASS = 'border-accent-400/70 shadow-[0_0_0_1px_rgba(96,165,250,0.2)] opacity-100';

const SELECTABLE_SWATCH_UNSELECTED_CLASS = 'border-gray-600 hover:border-gray-400';

export const SelectableSwatchButton: React.FC<SelectableSwatchButtonProps> = ({
  isSelected,
  type = 'button',
  className = '',
  selectedClassName = SELECTABLE_SWATCH_SELECTED_CLASS,
  unselectedClassName = SELECTABLE_SWATCH_UNSELECTED_CLASS,
  ...props
}) => (
  <button
    type={type}
    aria-pressed={isSelected}
    className={joinClasses(
      SELECTABLE_SWATCH_BUTTON_CLASS,
      className,
      isSelected ? selectedClassName : unselectedClassName,
    )}
    {...props}
  />
);
