import React from 'react';
import { Compass } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="w-full rounded-2xl bg-[#0E131F]/70 border border-white/[0.08] p-8 sm:p-10 text-center flex flex-col items-center justify-center my-4">
      <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 mb-4">
        <Compass className="w-5 h-5" />
      </div>
      <h3 className="text-base sm:text-lg font-display font-bold text-white mb-1.5">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-slate-400 max-w-sm leading-relaxed mb-5">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-xs font-semibold text-cyan-300 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
