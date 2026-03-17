import React from 'react';

export interface HeaderBarProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  subtitle?: string;
  leftContent?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const HeaderBar: React.FC<HeaderBarProps> = ({ icon: Icon, title, subtitle, leftContent, actions, className }) => {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs text-gray-400 bg-gray-950/30 p-2 rounded-lg border border-gray-800/50 ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 border-r border-gray-800/80 shrink-0 pr-2">
          <div className="p-1.5 bg-accent-500/10 rounded-lg">
            <Icon className="w-4 h-4 text-accent-500" />
          </div>
          <div className="leading-none">
            <h2 className="text-sm font-bold text-white">{title}</h2>
            {subtitle && <p className="text-[10px] text-gray-500 font-medium mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {leftContent && <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin pb-1 md:pb-0">{leftContent}</div>}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

export default HeaderBar;
