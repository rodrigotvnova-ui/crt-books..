import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CategoryItem } from '../types/models';

interface CategoryCardProps {
  category: CategoryItem;
  isActive?: boolean;
  workCount: number;
  onSelect: (categoryName: string) => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  isActive = false,
  workCount,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.name)}
      className={`group text-left rounded-2xl p-4 transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-3 min-h-[76px] cursor-pointer ${
        isActive
          ? 'bg-cyan-500/15 border border-cyan-400/60 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
          : 'bg-[#0E131F]/80 hover:bg-[#131B2E]/90 border border-white/[0.08] hover:border-white/15'
      }`}
    >
      <div className="min-w-0 space-y-1">
        <h3
          className={`text-sm font-display font-bold truncate transition-colors ${
            isActive ? 'text-cyan-300' : 'text-white group-hover:text-cyan-200'
          }`}
        >
          {category.name}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
          <span className="truncate">{category.subtitle}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular shrink-0">{workCount} {workCount === 1 ? 'obra' : 'obras'}</span>
        </div>
      </div>

      <ChevronRight
        className={`w-4 h-4 shrink-0 transition-transform ${
          isActive
            ? 'text-cyan-400 translate-x-0.5'
            : 'text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5'
        }`}
      />
    </button>
  );
};
