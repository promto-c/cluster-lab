import React from 'react';
import { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'default' | 'primary' | 'success' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  variant?: ButtonVariant;
}

export const buttonStyles = {
  base: 'flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap outline-none focus:ring-2 focus:ring-accent-500/20',
  variants: {
    default: 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white hover:border-gray-600',
    primary: 'bg-accent-600 border-accent-500/50 text-white hover:bg-accent-500 hover:border-accent-400',
    success:
      'bg-gray-800 border-gray-700 text-green-400 hover:bg-green-900/20 hover:border-green-800 hover:text-green-300',
    danger: 'bg-gray-800 border-gray-700 text-red-400 hover:bg-red-900/20 hover:border-red-800 hover:text-red-300',
    ghost: 'bg-transparent border-transparent text-gray-400 hover:text-white hover:bg-gray-800',
  },
};

export const Button: React.FC<ButtonProps> = ({
  icon: Icon,
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  return (
    <button className={`${buttonStyles.base} ${buttonStyles.variants[variant]} ${className}`} {...props}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
};
