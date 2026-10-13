import React from 'react';
import { ArrowUpRight, Compass, Flame, Landmark, MessageSquare, Target } from 'lucide-react';
import { GoalItem } from '../types/models';

interface GoalCardProps {
  goal: GoalItem;
  featuredSpan?: boolean;
  isSelected?: boolean;
  onSelect: (goal: GoalItem) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  featuredSpan = false,
  isSelected = false,
  onSelect,
}) => {
  const getIcon = () => {
    switch (goal.id) {
      case 'foco':
        return <Target className="w-4 h-4 text-cyan-400" />;
      case 'disciplina':
        return <Flame className="w-4 h-4 text-sky-400" />;
      case 'financas':
        return <Landmark className="w-4 h-4 text-amber-400" />;
      case 'vendas':
        return <Compass className="w-4 h-4 text-indigo-400" />;
      case 'comunicacao':
      default:
        return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(goal)}
      className={`group relative text-left rounded-2xl p-4 sm:p-5 transition-all duration-200 active:scale-[0.98] flex flex-col justify-between min-h-[124px] cursor-pointer ${
        featuredSpan ? 'col-span-2 sm:col-span-1' : 'col-span-1'
      } ${
        isSelected
          ? 'bg-[#162033] border border-cyan-400/60 shadow-[0_0_25px_rgba(34,211,238,0.14)]'
          : 'bg-[#0E131F]/85 hover:bg-[#131B2E]/90 border border-white/[0.08] hover:border-white/20'
      }`}
    >
      <div className="w-full flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center shrink-0">
            {getIcon()}
          </div>
          <span className="text-xs font-mono-tabular font-semibold tracking-wider text-cyan-300/90">
            {goal.label}
          </span>
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
      </div>

      <div>
        <p className="text-sm sm:text-base font-display font-bold text-white leading-snug group-hover:text-cyan-100 transition-colors">
          “{goal.statement}”
        </p>
        <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1 mt-1">
          {goal.description}
        </p>
      </div>
    </button>
  );
};
