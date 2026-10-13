import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Work } from '../types/models';
import { BookCover } from './BookCover';
import { ProgressBar } from './ProgressBar';

interface ContinueCardProps {
  work: Work;
  onContinue: (work: Work) => void;
  onSelectWork: (work: Work) => void;
}

function formatSecondsToHhMmSs(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const clamped = Math.floor(totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

export const ContinueCard: React.FC<ContinueCardProps> = ({
  work,
  onContinue,
  onSelectWork,
}) => {
  const isListening = work.progressType === 'listening';

  const savedPage =
    !isListening && typeof work.position === 'number' && work.position >= 1
      ? Math.floor(work.position)
      : 0;

  const savedSeconds =
    isListening && typeof work.position === 'number' && work.position > 0
      ? Math.floor(work.position)
      : 0;

  const audioAsset = work.assets.find(
    (a) => a.format === 'audio' || a.mimeType === 'audio/mpeg'
  );
  const audioDurationSeconds =
    audioAsset?.durationSeconds && audioAsset.durationSeconds > 0
      ? audioAsset.durationSeconds
      : 0;

  const formatLabel = isListening ? '🎧 Audiobook' : '📖 Ebook';

  const positionLabel = isListening
    ? savedSeconds > 0
      ? audioDurationSeconds > 0
        ? `${formatSecondsToHhMmSs(savedSeconds)} de ${formatSecondsToHhMmSs(audioDurationSeconds)}`
        : formatSecondsToHhMmSs(savedSeconds)
      : 'Audiobook em andamento'
    : savedPage >= 1
    ? work.totalPages && work.totalPages >= savedPage
      ? `Página ${savedPage} de ${work.totalPages}`
      : `Página ${savedPage}`
    : 'Leitura em andamento';

  const actionButtonLabel = isListening
    ? 'Continuar ouvindo'
    : 'Continuar lendo';

  return (
    <div
      onClick={() => onSelectWork(work)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectWork(work);
        }
      }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#121A2B]/95 via-[#0E131F]/95 to-[#090D16]/95 border border-white/[0.09] hover:border-cyan-400/35 p-5 sm:p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] transition-all duration-200 cursor-pointer group"
    >
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl group-hover:bg-cyan-400/15 transition-colors" />

      <div className="relative z-10 flex items-center gap-4 sm:gap-6">
        <BookCover work={work} size="md" className="shrink-0" />

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2 text-xs text-cyan-300 font-medium">
            <span>{formatLabel}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-400 font-mono-tabular truncate">
              {positionLabel}
            </span>
          </div>

          <div>
            <h3 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight truncate group-hover:text-cyan-200 transition-colors">
              {work.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 font-medium truncate">
              {work.author}
            </p>
          </div>

          <ProgressBar progress={work.progress} showLabel size="md" />

          <div className="pt-1 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContinue(work);
              }}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs sm:text-sm transition-all active:scale-[0.98] shadow-[0_0_24px_rgba(34,211,238,0.25)] whitespace-nowrap cursor-pointer"
            >
              <span>{actionButtonLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <span className="hidden sm:inline-block text-xs text-slate-400 hover:text-white transition-colors">
              Ver detalhes da obra
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
