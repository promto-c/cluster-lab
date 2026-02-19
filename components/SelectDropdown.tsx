import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectDropdownOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  groupLabel?: string;
  disabled?: boolean;
}

interface SelectDropdownProps {
  value: string;
  options: SelectDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholderLabel?: string;
  emptyLabel?: string;
  className?: string;
}

type SelectDropdownSection = {
  key: string;
  groupLabel?: string;
  options: SelectDropdownOption[];
};

const joinClasses = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(' ');

const SelectDropdown: React.FC<SelectDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  placeholderLabel = 'Select an option',
  emptyLabel = 'No options available',
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find(option => option.value === value) || null,
    [options, value]
  );

  const sections = useMemo<SelectDropdownSection[]>(() => {
    const grouped = new Map<string, SelectDropdownSection>();

    for (const option of options) {
      const groupLabel = option.groupLabel?.trim();
      const key = groupLabel || '__ungrouped__';
      const existing = grouped.get(key);
      if (existing) {
        existing.options.push(option);
        continue;
      }
      grouped.set(key, {
        key,
        groupLabel,
        options: [option],
      });
    }

    return Array.from(grouped.values());
  }, [options]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!disabled) return;
    setIsOpen(false);
  }, [disabled]);

  useEffect(() => {
    setIsOpen(false);
  }, [value]);

  const displayLabel = selectedOption?.label || (options.length > 0 ? placeholderLabel : emptyLabel);

  return (
    <div ref={containerRef} className={joinClasses('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors flex items-center justify-between gap-3
          ${disabled
            ? 'bg-gray-900/40 border-gray-800 text-gray-500 cursor-not-allowed'
            : isOpen
              ? 'bg-gray-950 border-accent-500 ring-1 ring-accent-500/50'
              : 'bg-gray-950 border-gray-700 hover:border-gray-600'
          }`}
      >
        <div className="min-w-0 flex flex-1 items-center gap-2">
          <span className={`flex-1 truncate text-sm ${disabled ? 'text-gray-500' : 'text-gray-200'}`}>
            {displayLabel}
          </span>
          {selectedOption?.badge && (
            <span className="max-w-[5.5rem] shrink-0 inline-flex items-center rounded-md border border-accent-500/50 bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-300 uppercase tracking-wide truncate">
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-700 bg-gray-950 shadow-2xl"
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {sections.map((section, sectionIndex) => (
              <div
                key={section.key}
                className={sectionIndex > 0 ? 'mt-1 pt-1 border-t border-gray-800/80' : undefined}
              >
                {section.groupLabel && (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {section.groupLabel}
                  </p>
                )}
                {section.options.map(option => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={() => {
                        if (option.disabled) return;
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 text-left transition-colors
                        ${option.disabled
                          ? 'opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'bg-accent-500/10'
                            : 'hover:bg-gray-900'
                        }`}
                    >
                      <div className="min-w-0 flex w-full items-center gap-2">
                        <span className={`flex-1 truncate text-sm ${isSelected ? 'text-accent-200' : 'text-gray-200'}`}>
                          {option.label}
                        </span>
                        {option.badge && (
                          <span
                            className={`max-w-[5.5rem] shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide truncate
                              ${isSelected
                                ? 'border-accent-400/70 bg-accent-500/20 text-accent-200'
                                : 'border-gray-600 bg-gray-800/80 text-gray-300'
                              }`}
                          >
                            {option.badge}
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <p className={`mt-1 truncate text-[11px] ${isSelected ? 'text-accent-300/80' : 'text-gray-500'}`}>
                          {option.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SelectDropdown;
