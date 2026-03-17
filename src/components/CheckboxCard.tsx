import React from 'react';
import { Check } from 'lucide-react';

interface CheckboxCardProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  checkedClassName?: string;
  uncheckedClassName?: string;
  indicatorClassName?: string;
  indicatorIconClassName?: string;
  showIndicator?: boolean;
}

const joinClasses = (...classes: Array<string | undefined | false>) => classes.filter(Boolean).join(' ');

const CheckboxCard: React.FC<CheckboxCardProps> = ({
  checked,
  onChange,
  children,
  className,
  contentClassName,
  checkedClassName = 'bg-accent-900/10 border-accent-500 ring-1 ring-accent-500/50',
  uncheckedClassName = 'bg-gray-950/30 border-gray-800 hover:border-gray-600 hover:bg-gray-900',
  indicatorClassName = 'absolute top-2 right-2',
  indicatorIconClassName = 'w-4 h-4 text-accent-500',
  showIndicator = true,
}) => {
  return (
    <label
      className={joinClasses(
        'relative cursor-pointer group rounded-xl border transition-all',
        checked ? checkedClassName : uncheckedClassName,
        className,
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <div className={contentClassName}>{children}</div>
      {showIndicator && checked && (
        <div className={indicatorClassName}>
          <Check className={indicatorIconClassName} />
        </div>
      )}
    </label>
  );
};

export default CheckboxCard;
