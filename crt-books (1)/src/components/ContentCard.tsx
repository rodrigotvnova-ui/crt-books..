import React from 'react';
import { Heart } from 'lucide-react';
import { Work } from '../types/models';
import { BookCover } from './BookCover';
import { FormatBadge } from './FormatBadge';
import { ProgressBar } from './ProgressBar';

interface ContentCardProps {
  work: Work;
  layout?: 'carousel' | 'grid' | 'list';
  onSelect: (work: Work) => void;
  onToggleSave?: (work: Work) => void;
}

function formatAudioPositionLabel(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

export const ContentCard: React.FC<ContentCardProps> = ({
  work,
  layout = 'carousel',
  onSelect,
  onToggleSave,
}) => {
  const isAudioProgress = work.progressType === 'listening';
  const hasVisibleProgress =
    work.progress > 0 ||
    (typeof work.position === 'number' &&
      (isAudioProgress ? work.position > 0 : work.position > 1));
  const displayProgressPercent =
    work.progress > 0 ? work.progress : hasVisibleProgress ? 1 : 0;

  const positionText = isAudioProgress
    ? work.position && work.position > 0
      ? formatAudioPositionLabel(work.position)
      : 'Audiobook'
    : work.position && work.position >= 1
    ? work.totalPages && work.totalPages >= work.position
      ? `Página ${Math.floor(work.position)} de ${work.totalPages}`
      : `Página ${Math.floor(work.position)}`
    : 'Ebook';

  if (layout === 'list') {
    return (
      <div
        onClick={() => onSelect(work)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(work);
          }
        }}
        className="group relative flex items-center gap-4 p-4 rounded-2xl bg-[#0E131F]/85 hover:bg-[#131B2E]/95 border border-white/[0.08] hover:border-cyan-400/30 transition-all duration-200 cursor-pointer"
      >
        <BookCover work={work} size="sm" />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-display font-bold text-white truncate group-hover:text-cyan-200 transition-colors">
                {work.title}
              </h3>
              <p className="text-xs text-slate-400 truncate">{work.author}</p>
            </div>

            {onToggleSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(work);
                }}
                aria-label={work.isSaved ? 'Remover da minha lista' : 'Adicionar à minha lista'}
                className="min-w-[40px] min-h-[40px] -mr-2 -mt-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-cyan-400 transition-colors shrink-0 cursor-pointer"
              >
                <Heart
                  className={`w-4 h-4 ${
                    work.isSaved ? 'fill-cyan-400 text-cyan-400' : ''
                  }`}
                />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <FormatBadge formats={work.availableFormats} variant="subtle" />
            {work.categories[0] && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-[11px] text-slate-400 truncate">
                  {work.categories[0]}
                </span>
              </>
            )}
          </div>

          {hasVisibleProgress && (
            <div className="pt-1 max-w-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate font-mono-tabular">
                  {positionText}
                </span>
                <span className="font-mono-tabular font-semibold text-cyan-400">
                  {displayProgressPercent}%
                </span>
              </div>
              <ProgressBar progress={displayProgressPercent} size="sm" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(work)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(work);
        }
      }}
      className={`group relative flex flex-col rounded-2xl bg-[#0E131F]/80 hover:bg-[#131B2E]/90 border border-white/[0.08] hover:border-cyan-400/30 p-3.5 transition-all duration-200 active:scale-[0.99] cursor-pointer ${
        layout === 'carousel' ? 'w-[172px] sm:w-[196px] shrink-0' : 'w-full'
      }`}
    >
      <div className="relative flex justify-center mb-3">
        <BookCover
          work={work}
          size="lg"
          className="w-full h-52 sm:h-56"
        />
        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(work);
            }}
            aria-label={work.isSaved ? 'Remover da minha lista' : 'Adicionar à minha lista'}
            className="absolute top-2 right-2 z-30 min-w-[38px] min-h-[38px] rounded-xl bg-[#07090E]/75 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:text-cyan-400 transition-colors cursor-pointer"
          >
            <Heart
              className={`w-4 h-4 ${
                work.isSaved ? 'fill-cyan-400 text-cyan-400' : ''
              }`}
            />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between space-y-2">
        <div>
          <h3 className="text-sm font-display font-bold text-white leading-snug line-clamp-1 group-hover:text-cyan-200 transition-colors">
            {work.title}
          </h3>
          <p className="text-xs text-slate-400 truncate mt-0.5">{work.author}</p>
        </div>

        <div className="pt-1 border-t border-white/[0.06] space-y-2">
          {hasVisibleProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate font-mono-tabular">
                  {positionText}
                </span>
                <span className="font-mono-tabular font-semibold text-cyan-400">
                  {displayProgressPercent}%
                </span>
              </div>
              <ProgressBar progress={displayProgressPercent} size="sm" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <FormatBadge formats={work.availableFormats} variant="subtle" />
          </div>
        </div>
      </div>
    </div>
  );
};
