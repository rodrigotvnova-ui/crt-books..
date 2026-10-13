import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Headphones,
  Heart,
  Share2,
} from 'lucide-react';
import { Work } from '../types/models';
import { BookCover } from './BookCover';
import { FormatBadge } from './FormatBadge';
import { ContentCard } from './ContentCard';
import { ProgressBar } from './ProgressBar';
import { SectionHeader } from './SectionHeader';

interface BookDetailsProps {
  work: Work;
  relatedWorks: Work[];
  onBack: () => void;
  onRead: (work: Work) => void;
  onListen: (work: Work) => void;
  onToggleSave: (work: Work) => void;
  onShare: (work: Work) => void;
  onSelectWork: (work: Work) => void;
  onToggleComplete: (work: Work) => void;
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

export const BookDetails: React.FC<BookDetailsProps> = ({
  work,
  relatedWorks,
  onBack,
  onRead,
  onListen,
  onToggleSave,
  onShare,
  onSelectWork,
  onToggleComplete,
}) => {
  const hasEbook = work.availableFormats.includes('ebook');
  const hasAudio =
    work.availableFormats.includes('audio') ||
    work.assets.some((a) => a.format === 'audio');
  const hasPdfEbookAsset = work.assets.some(
    (a) => a.format === 'ebook' && a.mimeType === 'application/pdf'
  );
  const audioAsset = work.assets.find(
    (a) => a.format === 'audio' || a.mimeType === 'audio/mpeg'
  );
  const audioDurationSeconds =
    audioAsset?.durationSeconds && audioAsset.durationSeconds > 0
      ? audioAsset.durationSeconds
      : 0;
  const isListeningProgress = work.progressType === 'listening';
  const savedPage =
    !isListeningProgress &&
    typeof work.position === 'number' &&
    work.position >= 1
      ? Math.floor(work.position)
      : 0;
  const savedAudioSeconds =
    isListeningProgress &&
    typeof work.position === 'number' &&
    work.position > 0
      ? Math.floor(work.position)
      : 0;
  const hasReadingProgress =
    hasEbook && !isListeningProgress && (work.progress > 0 || savedPage > 1);
  const hasAudioProgress =
    hasAudio &&
    isListeningProgress &&
    (work.progress > 0 || savedAudioSeconds > 0);
  const readButtonLabel = hasReadingProgress ? 'Continuar lendo' : 'Ler agora';
  const listenButtonLabel = hasAudioProgress
    ? 'Continuar ouvindo'
    : 'Ouvir agora';

  return (
    <div className="animate-in fade-in duration-200 pb-10">
      {/* Top Contextual Action Bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0E131F]/90 hover:bg-[#151D2E] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleComplete(work)}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              work.status === 'completed'
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : 'bg-[#0E131F]/90 border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {work.status === 'completed' ? 'Concluído' : 'Marcar concluído'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Hero Overview Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#111827]/90 to-[#0B0F19]/95 border border-white/[0.08] p-6 sm:p-8 mb-6 shadow-[0_24px_48px_-15px_rgba(0,0,0,0.75)]">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
          <BookCover work={work} size="xl" className="shrink-0" />

          <div className="flex-1 min-w-0 text-center md:text-left space-y-4 w-full">
            {/* Unboxed Metadata: Category & Formats */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2.5 gap-y-1 text-xs text-cyan-400 font-medium">
              {work.categories.length > 0 && (
                <>
                  <span>{work.categories.join(' / ')}</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                </>
              )}
              <FormatBadge formats={work.availableFormats} />
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-slate-400 font-mono-tabular">
                {work.duration}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                {work.title}
              </h1>
              {work.subtitle && (
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  {work.subtitle}
                </p>
              )}
              <p className="text-sm font-semibold text-slate-400 mt-2">
                Por <span className="text-slate-200">{work.author}</span>
              </p>
            </div>

            {/* Unboxed Tags (Zero-Pill Discipline) */}
            {work.tags.length > 0 && (
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2 gap-y-1 text-xs text-slate-400 pt-1">
                <span className="text-slate-500 font-medium">Temas:</span>
                {work.tags.map((tag, idx) => (
                  <React.Fragment key={tag}>
                    <span className="text-slate-300">{tag}</span>
                    {idx < work.tags.length - 1 && (
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {hasReadingProgress && (
              <div className="max-w-md mx-auto md:mx-0 pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span>
                    📖 Ebook ·{' '}
                    {savedPage >= 1
                      ? work.totalPages && work.totalPages >= savedPage
                        ? `Página ${savedPage} de ${work.totalPages}`
                        : `Página ${savedPage}`
                      : 'Leitura iniciada'}
                  </span>
                  <span className="font-mono-tabular font-semibold text-cyan-400">
                    {work.progress}% concluído
                  </span>
                </div>
                <ProgressBar progress={work.progress} showLabel={false} size="md" />
              </div>
            )}

            {hasAudioProgress && (
              <div className="max-w-md mx-auto md:mx-0 pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="font-mono-tabular">
                    🎧 Audiobook ·{' '}
                    {savedAudioSeconds > 0
                      ? audioDurationSeconds > 0
                        ? `${formatSecondsToHhMmSs(savedAudioSeconds)} de ${formatSecondsToHhMmSs(audioDurationSeconds)}`
                        : formatSecondsToHhMmSs(savedAudioSeconds)
                      : 'Audiobook em andamento'}
                  </span>
                  <span className="font-mono-tabular font-semibold text-cyan-400">
                    {work.progress > 0 ? work.progress : 1}% concluído
                  </span>
                </div>
                <ProgressBar
                  progress={work.progress > 0 ? work.progress : 1}
                  showLabel={false}
                  size="md"
                />
              </div>
            )}

            {/* Primary Format CTAs (Ler agora / Continuar lendo / Ouvir agora / Continuar ouvindo) */}
            <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-center md:justify-start gap-3">
              {hasPdfEbookAsset && (
                <button
                  type="button"
                  onClick={() => onRead(work)}
                  className="inline-flex items-center justify-center gap-2.5 min-h-[48px] px-7 py-3 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-sm tracking-wide transition-all active:scale-[0.98] shadow-[0_0_28px_rgba(34,211,238,0.28)] whitespace-nowrap cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>{readButtonLabel}</span>
                </button>
              )}

              {hasAudio && (
                <button
                  type="button"
                  onClick={() => onListen(work)}
                  className={`inline-flex items-center justify-center gap-2.5 min-h-[48px] px-7 py-3 rounded-2xl font-display font-bold text-sm tracking-wide transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer ${
                    !hasEbook
                      ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.28)]'
                      : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/15'
                  }`}
                >
                  <Headphones className="w-4 h-4" />
                  <span>{listenButtonLabel}</span>
                </button>
              )}
            </div>

            {/* Secondary Actions: Adicionar à minha lista + Compartilhar */}
            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <button
                type="button"
                onClick={() => onToggleSave(work)}
                className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap ${
                  work.isSaved
                    ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                    : 'bg-[#0E131F] hover:bg-white/[0.06] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${
                    work.isSaved ? 'fill-cyan-400 text-cyan-400' : ''
                  }`}
                />
                <span>
                  {work.isSaved
                    ? 'Salvo na minha lista'
                    : '♡ Adicionar à minha lista'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onShare(work)}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#0E131F] hover:bg-white/[0.06] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-300 hover:text-white transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartilhar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-10">
        {/* Sobre a obra */}
        <div className="md:col-span-7 rounded-2xl bg-[#0E131F]/80 border border-white/[0.08] p-5 sm:p-6 space-y-3">
          <h2 className="text-base sm:text-lg font-display font-bold text-white">
            Descrição da obra
          </h2>
          {work.description && work.description.trim() ? (
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {work.description}
            </p>
          ) : (
            <p className="text-sm text-slate-400 italic">
              Nenhuma descrição cadastrada no banco de dados para esta obra.
            </p>
          )}

          {/* Arquitetura WORK -> ASSETS info */}
          <div className="pt-4 mt-4 border-t border-white/[0.06] flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
            <span className="text-slate-500">Assets associados à obra:</span>
            {work.assets.map((asset) => (
              <span key={asset.id} className="text-slate-300 font-mono-tabular">
                {asset.format === 'ebook' ? '📖 Ebook' : '🎧 Audiobook'} ({asset.durationOrPages})
              </span>
            ))}
          </div>
        </div>

        {/* Este conteúdo pode ajudar você a: / Metadados reais */}
        <div className="md:col-span-5 rounded-2xl bg-[#0E131F]/80 border border-white/[0.08] p-5 sm:p-6 space-y-4">
          <h2 className="text-base sm:text-lg font-display font-bold text-white">
            {work.benefits.length > 0
              ? 'Este conteúdo pode ajudar você a:'
              : 'Ficha técnica da obra'}
          </h2>
          {work.benefits.length > 0 ? (
            <ul className="space-y-3">
              {work.benefits.map((benefit, index) => (
                <li
                  key={benefit}
                  className="flex items-start gap-3 text-sm text-slate-200 leading-snug"
                >
                  <span className="font-mono-tabular text-xs font-semibold text-cyan-400 pt-0.5 shrink-0">
                    0{index + 1}.
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
              <li className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-slate-400">Autor</span>
                <span className="font-medium text-white">{work.author}</span>
              </li>
              <li className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-slate-400">Idioma</span>
                <span className="font-mono-tabular text-slate-200">
                  {work.language || 'pt-BR'}
                </span>
              </li>
              <li className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-slate-400">Formato / MIME</span>
                <span className="font-mono-tabular text-slate-200">
                  {work.assets[0]?.mimeType || 'application/pdf'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-400">Status no acervo</span>
                <span className="font-mono-tabular text-amber-300">
                  {work.dbStatus || 'draft'} · {work.rightsStatus || 'pending'}
                </span>
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* Você também pode gostar */}
      {relatedWorks.length > 0 && (
        <section>
          <SectionHeader
            title="Você também pode gostar"
            subtitle="Obras conectadas ao mesmo objetivo de desenvolvimento"
          />
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
            {relatedWorks.map((item) => (
              <ContentCard
                key={item.id}
                work={item}
                layout="carousel"
                onSelect={onSelectWork}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
