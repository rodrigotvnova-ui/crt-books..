import React from 'react';

interface ProgressBarProps {
  progress: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  showLabel = false,
  size = 'md',
  className = '',
}) => {
  const clamped = Math.min(100, Math.max(0, progress));
  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-cyan-400 font-semibold font-mono-tabular">
            {clamped}% concluído
          </span>
          <span className="text-slate-400 font-mono-tabular text-[11px]">
            {100 - clamped}% restante
          </span>
        </div>
      )}
      <div
        className={`w-full bg-white/[0.07] rounded-full overflow-hidden ${heightClass}`}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
