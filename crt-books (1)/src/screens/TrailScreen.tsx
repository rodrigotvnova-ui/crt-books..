import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Headphones,
  Heart,
  Play,
  Route,
} from 'lucide-react';
import {
  CURATED_LEARNING_TRAILS,
  LearningTrailDefinition,
  ResolvedLearningTrail,
  ResolvedTrailStep,
  fetchRelationalTrailsFromBackend,
  findTrailByIdOrSlug,
  resolveLearningTrails,
  selectActiveTrailInBackend,
} from '../data/trailsData';
import { OnboardingPreferences, Work } from '../types/models';
import { BookCover } from '../components/BookCover';
import { ProgressBar } from '../components/ProgressBar';
import { SectionHeader } from '../components/SectionHeader';

interface TrailScreenProps {
  userId?: string;
  preferences: OnboardingPreferences;
  libraryWorks: Work[];
  isLoading?: boolean;
  openedTrailId?: string | null;
  onOpenTrailChange?: (trailId: string | null) => void;
  onSelectWork: (work: Work) => void;
  onStartOrContinueWork: (work: Work) => void;
  onToggleSave?: (work: Work) => void;
  onNotify?: (title: string, subtitle?: string) => void;
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

function formatStepIndex(num: number): string {
  return String(Math.max(1, Math.floor(num))).padStart(2, '0');
}

function isAudioWork(work: Work, expectedFormat?: 'ebook' | 'audio'): boolean {
  if (work.progressType === 'listening') return true;
  if (
    work.availableFormats.includes('audio') &&
    !work.availableFormats.includes('ebook')
  ) {
    return true;
  }
  if (
    work.assets.some(
      (a) => a.format === 'audio' || a.mimeType === 'audio/mpeg'
    ) &&
    !work.assets.some((a) => a.format === 'ebook')
  ) {
    return true;
  }
  return expectedFormat === 'audio';
}

function getWorkPositionSummary(
  work: Work,
  expectedFormat?: 'ebook' | 'audio'
): {
  isAudio: boolean;
  formatText: string;
  positionLabel: string;
  hasStarted: boolean;
  actionLabel: string;
} {
  const isAudio = isAudioWork(work, expectedFormat);
  const isCompleted = work.status === 'completed' || work.progress >= 100;

  if (isAudio) {
    const audioAsset = work.assets.find(
      (a) => a.format === 'audio' || a.mimeType === 'audio/mpeg'
    );
    const totalDurationSec =
      audioAsset?.durationSeconds && audioAsset.durationSeconds > 0
        ? audioAsset.durationSeconds
        : 0;
    const savedSec =
      work.progressType === 'listening' &&
      typeof work.position === 'number' &&
      work.position > 0
        ? Math.floor(work.position)
        : 0;
    const hasStarted = isCompleted || work.progress > 0 || savedSec > 0;

    let positionLabel = work.duration || 'Audiobook MP3';
    if (savedSec > 0) {
      positionLabel =
        totalDurationSec > 0
          ? `${formatSecondsToHhMmSs(savedSec)} de ${formatSecondsToHhMmSs(totalDurationSec)}`
          : formatSecondsToHhMmSs(savedSec);
    } else if (totalDurationSec > 0) {
      positionLabel = `Duração: ${formatSecondsToHhMmSs(totalDurationSec)}`;
    }

    const actionLabel = isCompleted
      ? 'Ouvir novamente'
      : hasStarted
      ? 'Continuar ouvindo'
      : 'Ouvir agora';

    return {
      isAudio: true,
      formatText: '🎧 Audiobook',
      positionLabel,
      hasStarted,
      actionLabel,
    };
  }

  const savedPage =
    work.progressType !== 'listening' &&
    typeof work.position === 'number' &&
    work.position >= 1
      ? Math.floor(work.position)
      : 0;
  const hasStarted = isCompleted || work.progress > 0 || savedPage > 1;

  let positionLabel = work.duration || 'Ebook PDF';
  if (savedPage >= 1) {
    positionLabel =
      work.totalPages && work.totalPages >= savedPage
        ? `Página ${savedPage} de ${work.totalPages}`
        : `Página ${savedPage}`;
  } else if (work.totalPages && work.totalPages > 0) {
    positionLabel = `${work.totalPages} páginas`;
  }

  const actionLabel = isCompleted
    ? 'Ler novamente'
    : hasStarted
    ? 'Continuar lendo'
    : 'Ler agora';

  return {
    isAudio: false,
    formatText: '📖 Ebook',
    positionLabel,
    hasStarted,
    actionLabel,
  };
}

export const TrailScreen: React.FC<TrailScreenProps> = ({
  userId,
  preferences,
  libraryWorks,
  isLoading = false,
  openedTrailId: controlledOpenedTrailId,
  onOpenTrailChange,
  onSelectWork,
  onStartOrContinueWork,
  onToggleSave,
  onNotify,
}) => {
  const storageKey = `crt_active_trail_v1_${userId || 'guest'}`;

  const [trailDefinitions, setTrailDefinitions] = useState<
    LearningTrailDefinition[]
  >(CURATED_LEARNING_TRAILS);
  const [isSyncingTrails, setIsSyncingTrails] = useState<boolean>(false);

  const defaultTrailId = useMemo(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(storageKey);
      const foundSaved = findTrailByIdOrSlug(trailDefinitions, saved);
      if (foundSaved) {
        return foundSaved.id;
      }
    }
    if (preferences.interests.length > 0) {
      const matched = trailDefinitions.find((t) =>
        t.relatedInterestNames.some((interest) =>
          preferences.interests.some(
            (userInt) => userInt.toLowerCase() === interest.toLowerCase()
          )
        )
      );
      if (matched) return matched.id;
    }
    return trailDefinitions[0]?.id || CURATED_LEARNING_TRAILS[0].id;
  }, [storageKey, preferences.interests, trailDefinitions]);

  const [selectedTrailId, setSelectedTrailId] =
    useState<string>(defaultTrailId);
  const [internalOpenedTrailId, setInternalOpenedTrailId] = useState<
    string | null
  >(null);

  const openedTrailId =
    controlledOpenedTrailId !== undefined
      ? controlledOpenedTrailId
      : internalOpenedTrailId;

  const setOpenedTrailId = (nextId: string | null) => {
    setInternalOpenedTrailId(nextId);
    if (onOpenTrailChange) {
      onOpenTrailChange(nextId);
    }
  };

  // Carrega trilhas, etapas ordenadas e trilha ativa diretamente do Supabase (/api/trails)
  useEffect(() => {
    let cancelled = false;
    setIsSyncingTrails(true);

    fetchRelationalTrailsFromBackend(userId)
      .then((result) => {
        if (cancelled || !result) return;
        if (result.definitions.length > 0) {
          setTrailDefinitions(result.definitions);
        }
        if (result.activeTrailId) {
          setSelectedTrailId(result.activeTrailId);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, result.activeTrailId);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncingTrails(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, storageKey]);

  const resolvedTrails: ResolvedLearningTrail[] = useMemo(
    () =>
      resolveLearningTrails(libraryWorks, trailDefinitions, selectedTrailId),
    [libraryWorks, trailDefinitions, selectedTrailId]
  );

  const activeTrail: ResolvedLearningTrail = useMemo(
    () =>
      findTrailByIdOrSlug(resolvedTrails, selectedTrailId) || resolvedTrails[0],
    [resolvedTrails, selectedTrailId]
  );

  const openedTrail: ResolvedLearningTrail | null = useMemo(() => {
    if (!openedTrailId) return null;
    return findTrailByIdOrSlug(resolvedTrails, openedTrailId);
  }, [resolvedTrails, openedTrailId]);

  const handleOpenAndSelectTrail = async (trailIdOrSlug: string) => {
    const chosen = findTrailByIdOrSlug(resolvedTrails, trailIdOrSlug);
    const targetId = chosen?.id || trailIdOrSlug;
    const wasAlreadyActive =
      selectedTrailId === targetId || activeTrail.id === targetId;

    setSelectedTrailId(targetId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, targetId);
    }

    setOpenedTrailId(targetId);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (chosen && onNotify && !wasAlreadyActive) {
      onNotify('Trilha selecionada', chosen.title);
    }

    // Persiste a trilha selecionada como ativa em `user_trails` no Supabase
    const updated = await selectActiveTrailInBackend(userId, targetId);
    if (updated?.activeTrailId) {
      setSelectedTrailId(updated.activeTrailId);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, updated.activeTrailId);
      }
    }
  };

  const handleBackToTrailsList = () => {
    setOpenedTrailId(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ============================================================================
  // VISÃO 2: TELA DE DETALHES DA TRILHA (aberta ao clicar em qualquer card)
  // Renderiza dinamicamente N etapas ordenadas (3, 4, 5, 7, 10+ etapas)
  // ============================================================================
  if (openedTrail) {
    const nextStep: ResolvedTrailStep | null = openedTrail.nextStep;
    const isThisTrailActive = openedTrail.id === activeTrail.id;

    return (
      <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200 pb-8">
        {/* Barra Superior de Navegação da Trilha */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={handleBackToTrailsList}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-cyan-400" />
            <span>Voltar para trilhas</span>
          </button>

          <div className="flex items-center gap-2 text-xs font-mono-tabular">
            <span className="text-cyan-400 font-semibold">
              {isThisTrailActive ? '● TRILHA ATIVA' : 'TRILHA SELECIONADA'}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="text-slate-400">
              {openedTrail.completedCount}/{openedTrail.totalSteps} etapas
            </span>
          </div>
        </div>

        {/* Cabeçalho Completo da Trilha + Resumo de Progresso */}
        <section className="rounded-3xl bg-gradient-to-b from-[#131F33]/95 via-[#0E131F]/95 to-[#090D16]/95 border border-cyan-400/30 p-6 sm:p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-white/[0.08] pb-6">
            <div className="space-y-2.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-cyan-400">
                <Compass className="w-3.5 h-3.5" />
                <span>{openedTrail.shortLabel.toUpperCase()}</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-slate-300">
                  {openedTrail.totalSteps} etapas em sequência
                </span>
              </div>

              <h1 className="text-xl sm:text-3xl font-display font-bold text-white tracking-tight leading-tight">
                “{openedTrail.questionStatement}”
              </h1>

              <p className="text-xs sm:text-sm font-medium text-cyan-300">
                Trilha: {openedTrail.title}
              </p>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                {openedTrail.description} {openedTrail.outcomeSummary}
              </p>
            </div>

            {/* Bloco de Progresso Geral da Trilha */}
            <div className="w-full md:w-72 shrink-0 space-y-3 bg-[#0B0F19]/95 border border-white/[0.08] rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  Progresso da trilha
                </span>
                <span className="font-mono-tabular font-bold text-cyan-400 text-sm">
                  {openedTrail.overallProgressPercent}%
                </span>
              </div>

              <ProgressBar
                progress={openedTrail.overallProgressPercent}
                showLabel={false}
                size="md"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular">
                <span>
                  {openedTrail.completedCount} de {openedTrail.totalSteps}{' '}
                  concluídas
                </span>
                <span>
                  {openedTrail.inProgressCount > 0
                    ? `${openedTrail.inProgressCount} em andamento`
                    : openedTrail.completedCount === openedTrail.totalSteps
                    ? 'Trilha concluída'
                    : 'Pronta para iniciar'}
                </span>
              </div>

              {nextStep && (
                <button
                  type="button"
                  onClick={() => onStartOrContinueWork(nextStep.work)}
                  className="w-full mt-1 inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(34,211,238,0.25)] cursor-pointer"
                >
                  {isAudioWork(nextStep.work, nextStep.expectedFormat) ? (
                    <Headphones className="w-4 h-4" />
                  ) : (
                    <BookOpen className="w-4 h-4" />
                  )}
                  <span>
                    {openedTrail.overallProgressPercent > 0 ||
                    openedTrail.inProgressCount > 0
                      ? `Continuar Etapa ${nextStep.stepNumber}`
                      : 'Iniciar Etapa 1 agora'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Destaque da Etapa Atual Recomendada ("Seu Foco Agora") */}
          {nextStep && (
            <div className="rounded-2xl bg-[#0B111E] border border-cyan-400/35 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-mono-tabular text-cyan-400">
                  <Play className="w-3.5 h-3.5 fill-cyan-400" />
                  <span>
                    PASSO ATUAL RECOMENDADO · ETAPA{' '}
                    {formatStepIndex(nextStep.stepNumber)} DE{' '}
                    {formatStepIndex(openedTrail.totalSteps)}
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-mono-tabular">
                  {nextStep.stepTitle}
                </span>
              </div>

              {(() => {
                const summary = getWorkPositionSummary(
                  nextStep.work,
                  nextStep.expectedFormat
                );
                return (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div
                      onClick={() => onSelectWork(nextStep.work)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectWork(nextStep.work);
                        }
                      }}
                      className="shrink-0 cursor-pointer"
                    >
                      <BookCover work={nextStep.work} size="md" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2.5 w-full">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span className="text-cyan-300 font-medium">
                          {summary.formatText}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="font-mono-tabular text-slate-300">
                          {summary.positionLabel}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="font-mono-tabular font-semibold text-cyan-400">
                          {nextStep.progressPercent}% concluído
                        </span>
                      </div>

                      <div>
                        <h2
                          onClick={() => onSelectWork(nextStep.work)}
                          className="text-lg sm:text-xl font-display font-bold text-white hover:text-cyan-200 transition-colors cursor-pointer"
                        >
                          {nextStep.work.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400">
                          {nextStep.work.author}
                        </p>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        {nextStep.rationale}
                      </p>

                      {nextStep.progressPercent > 0 && (
                        <div className="max-w-md pt-1">
                          <ProgressBar
                            progress={nextStep.progressPercent}
                            showLabel={false}
                            size="sm"
                          />
                        </div>
                      )}

                      <div className="pt-2 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onStartOrContinueWork(nextStep.work)}
                          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs sm:text-sm transition-all active:scale-[0.98] shadow-[0_0_24px_rgba(34,211,238,0.25)] cursor-pointer"
                        >
                          {summary.isAudio ? (
                            <Headphones className="w-4 h-4" />
                          ) : (
                            <BookOpen className="w-4 h-4" />
                          )}
                          <span>{summary.actionLabel}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectWork(nextStep.work)}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                        >
                          <span>Ver detalhes da obra</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Lista Completa de Etapas Numeradas da Trilha (Etapa 1..N) */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-display font-bold text-white">
                  Etapas da Trilha ({openedTrail.totalSteps} obras)
                </h2>
                <p className="text-xs text-slate-400">
                  Siga a ordem abaixo para construir seu conhecimento passo a
                  passo
                </p>
              </div>
              {(isLoading || isSyncingTrails) && (
                <span className="text-xs text-slate-400 font-mono-tabular">
                  Sincronizando progresso...
                </span>
              )}
            </div>

            <div className="space-y-0">
              {openedTrail.resolvedSteps.map((step, index) => {
                const summary = getWorkPositionSummary(
                  step.work,
                  step.expectedFormat
                );
                const isCompleted = step.stepStatus === 'completed';
                const isInProgress = step.stepStatus === 'in_progress';
                const isCurrent = step.stepStatus === 'current';

                const statusText = isCompleted
                  ? 'Concluído'
                  : isInProgress
                  ? 'Em andamento'
                  : isCurrent
                  ? 'Passo atual recomendado'
                  : 'Próxima etapa';

                return (
                  <React.Fragment
                    key={`${openedTrail.id}-detail-step-${step.stepNumber}`}
                  >
                    <div
                      className={`rounded-2xl p-4 sm:p-5 border transition-all ${
                        isCompleted
                          ? 'bg-[#0B121E]/90 border-emerald-500/30'
                          : isInProgress || isCurrent
                          ? 'bg-[#0E1628]/95 border-cyan-400/45 shadow-[0_12px_30px_-12px_rgba(34,211,238,0.12)]'
                          : 'bg-[#0B0F19]/85 border-white/[0.08]'
                      }`}
                    >
                      {/* Topo da Etapa: Numeração + Título da Etapa + Status */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono-tabular font-bold ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : isInProgress || isCurrent
                                ? 'bg-cyan-400 text-slate-950'
                                : 'bg-white/[0.06] text-slate-400 border border-white/[0.08]'
                            }`}
                          >
                            {formatStepIndex(step.stepNumber)}
                          </span>
                          <div>
                            <span className="text-xs sm:text-sm font-display font-bold text-white">
                              Etapa {step.stepNumber} — {step.stepTitle}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs">
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : isInProgress || isCurrent ? (
                            <Compass className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span
                            className={`font-medium ${
                              isCompleted
                                ? 'text-emerald-300'
                                : isInProgress || isCurrent
                                ? 'text-cyan-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {statusText}
                          </span>
                        </div>
                      </div>

                      {/* Corpo da Etapa: Capa + Título + Autor + Formato + Progresso + Botões */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div
                          onClick={() => onSelectWork(step.work)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectWork(step.work);
                            }
                          }}
                          className="shrink-0 cursor-pointer"
                        >
                          <BookCover work={step.work} size="sm" />
                        </div>

                        <div className="flex-1 min-w-0 space-y-2 w-full">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3
                                onClick={() => onSelectWork(step.work)}
                                className="text-base sm:text-lg font-display font-bold text-white hover:text-cyan-200 transition-colors cursor-pointer"
                              >
                                {step.work.title}
                              </h3>
                              <p className="text-xs sm:text-sm text-slate-400">
                                {step.work.author}
                              </p>
                            </div>

                            {onToggleSave && (
                              <button
                                type="button"
                                onClick={() => onToggleSave(step.work)}
                                aria-label={
                                  step.work.isSaved
                                    ? 'Remover da Minha Lista'
                                    : 'Salvar na Minha Lista'
                                }
                                className="min-w-[38px] min-h-[38px] rounded-xl bg-white/[0.04] hover:bg-white/[0.09] flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors shrink-0 cursor-pointer"
                              >
                                <Heart
                                  className={`w-4 h-4 ${
                                    step.work.isSaved
                                      ? 'fill-cyan-400 text-cyan-400'
                                      : ''
                                  }`}
                                />
                              </button>
                            )}
                          </div>

                          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            <span className="text-slate-400 font-medium">
                              Por que nesta etapa:{' '}
                            </span>
                            {step.rationale}
                          </p>

                          {/* Metadados: Formato · Posição real · Percentual */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 pt-0.5">
                            <span className="text-slate-200 font-medium">
                              {summary.formatText}
                            </span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="font-mono-tabular text-slate-300">
                              {summary.positionLabel}
                            </span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="font-mono-tabular font-semibold text-cyan-400">
                              {step.progressPercent}% concluído
                            </span>
                          </div>

                          <div className="max-w-sm pt-1">
                            <ProgressBar
                              progress={step.progressPercent}
                              showLabel={false}
                              size="sm"
                            />
                          </div>

                          {/* Botões de Ação Funcionais da Etapa */}
                          <div className="pt-2 flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => onStartOrContinueWork(step.work)}
                              className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all cursor-pointer ${
                                isInProgress || isCurrent
                                  ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1]'
                              }`}
                            >
                              {summary.isAudio ? (
                                <Headphones className="w-4 h-4" />
                              ) : (
                                <BookOpen className="w-4 h-4" />
                              )}
                              <span>{summary.actionLabel}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onSelectWork(step.work)}
                              className="inline-flex items-center justify-center min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] transition-colors cursor-pointer"
                            >
                              Ver detalhes
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {index < openedTrail.resolvedSteps.length - 1 && (
                      <div
                        className="flex flex-col items-center justify-center py-1.5 text-cyan-400/70"
                        aria-hidden="true"
                      >
                        <div className="w-px h-2.5 bg-gradient-to-b from-cyan-400/30 to-cyan-400/80" />
                        <ArrowDown className="w-3.5 h-3.5 -my-0.5" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Rodapé de Retorno para a Lista de Trilhas */}
          <div className="pt-4 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBackToTrailsList}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400" />
              <span>Trocar de objetivo / Ver todas as trilhas</span>
            </button>

            <span className="text-xs text-slate-400 font-mono-tabular">
              Progresso sincronizado automaticamente com sua conta
            </span>
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // VISÃO 1: SELEÇÃO DE TRILHAS ("O que você quer desenvolver?")
  // Ao clicar em qualquer card ou botão, persiste no Supabase e abre os Detalhes da Trilha!
  // ============================================================================
  const activeNextStep: ResolvedTrailStep | null = activeTrail.nextStep;

  return (
    <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-200 pb-8">
      {/* Header da Página */}
      <div className="space-y-2 pt-1">
        <div className="inline-flex items-center gap-2 text-xs font-mono-tabular text-cyan-400">
          <Route className="w-3.5 h-3.5" />
          <span>JORNADA GUIADA CRT BOOKS</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
          Minha Trilha
        </h1>
        <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
          Você não precisa procurar entre milhares de livros. Clique no objetivo
          que deseja desenvolver agora para abrir sua trilha passo a passo.
        </p>
      </div>

      {/* SEÇÃO 1: O que você quer desenvolver? (Cards clicáveis que abrem a Tela de Detalhes da Trilha) */}
      <section>
        <SectionHeader
          title="O que você quer desenvolver?"
          subtitle="Toque em uma trilha para abrir as etapas e começar imediatamente"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {resolvedTrails.map((trail) => {
            const isSelected = trail.id === activeTrail.id;
            const hasTrailProgress =
              trail.overallProgressPercent > 0 || trail.completedCount > 0;

            return (
              <div
                key={trail.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenAndSelectTrail(trail.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenAndSelectTrail(trail.id);
                  }
                }}
                className={`group text-left rounded-2xl p-5 transition-all duration-200 border cursor-pointer flex flex-col justify-between gap-4 ${
                  isSelected
                    ? 'bg-gradient-to-br from-[#131F33]/95 via-[#0E1525]/95 to-[#0A0F1A]/95 border-cyan-400/55 shadow-[0_16px_40px_-12px_rgba(34,211,238,0.2)] hover:border-cyan-300'
                    : 'bg-[#0E131F]/85 hover:bg-[#131B2E]/95 border-white/[0.08] hover:border-cyan-400/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-mono-tabular font-semibold ${
                        isSelected ? 'text-cyan-400' : 'text-slate-400'
                      }`}
                    >
                      {trail.shortLabel}
                    </span>
                    <span className="text-slate-400 font-mono-tabular">
                      {trail.completedCount}/{trail.totalSteps} etapas
                      {hasTrailProgress
                        ? ` · ${trail.overallProgressPercent}%`
                        : ''}
                    </span>
                  </div>

                  <h3
                    className={`text-base sm:text-lg font-display font-bold leading-snug transition-colors ${
                      isSelected
                        ? 'text-white'
                        : 'text-slate-200 group-hover:text-white'
                    }`}
                  >
                    “{trail.questionStatement}”
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {trail.description}
                  </p>

                  {/* Preview das etapas reais da trilha em ordem */}
                  <div className="pt-1 space-y-1.5">
                    {trail.resolvedSteps.map((s) => {
                      const stepIsAudio = isAudioWork(s.work, s.expectedFormat);
                      return (
                        <div
                          key={`${trail.id}-preview-${s.stepNumber}`}
                          className="flex items-center justify-between gap-2 text-[11px] text-slate-300/90 bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.04]"
                        >
                          <span className="truncate font-medium">
                            <span className="font-mono-tabular text-cyan-400 mr-1.5">
                              {formatStepIndex(s.stepNumber)}.
                            </span>
                            {s.work.title}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono-tabular text-slate-400">
                            {stepIsAudio ? '🎧 Áudio' : '📖 Ebook'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400 truncate">{trail.title}</span>
                  <span
                    className={`font-semibold whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 group-hover:bg-cyan-400 group-hover:text-slate-950'
                        : 'bg-white/[0.05] text-slate-200 group-hover:bg-cyan-400 group-hover:text-slate-950'
                    }`}
                  >
                    <span>
                      {isSelected
                        ? 'Trilha ativa · Abrir'
                        : 'Selecionar trilha'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SEÇÃO 2: Resumo Rápido da Trilha Ativa (para continuar imediatamente ou ver todas as etapas) */}
      <section className="rounded-3xl bg-gradient-to-b from-[#121A2D]/95 via-[#0E131F]/95 to-[#090D16]/95 border border-white/[0.09] p-6 sm:p-7 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono-tabular">
              <Compass className="w-3.5 h-3.5" />
              <span>SUA TRILHA ATIVA NO MOMENTO</span>
            </div>
            <h2 className="text-lg sm:text-xl font-display font-bold text-white">
              {activeTrail.title}
            </h2>
            <p className="text-xs text-slate-400">
              “{activeTrail.questionStatement}” · {activeTrail.completedCount}/
              {activeTrail.totalSteps} etapas ({activeTrail.overallProgressPercent}
              %)
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenAndSelectTrail(activeTrail.id)}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.1] text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer shrink-0"
          >
            <span>Ver todas as etapas da trilha</span>
            <ArrowRight className="w-4 h-4 text-cyan-400" />
          </button>
        </div>

        {activeNextStep && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0B111E] border border-cyan-400/25 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-4 min-w-0">
              <div
                onClick={() => onSelectWork(activeNextStep.work)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectWork(activeNextStep.work);
                  }
                }}
                className="shrink-0 cursor-pointer"
              >
                <BookCover work={activeNextStep.work} size="sm" />
              </div>

              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-mono-tabular text-cyan-400">
                  PRÓXIMO PASSO · ETAPA{' '}
                  {formatStepIndex(activeNextStep.stepNumber)} DE{' '}
                  {formatStepIndex(activeTrail.totalSteps)}
                </div>
                <h3
                  onClick={() => onSelectWork(activeNextStep.work)}
                  className="text-base font-display font-bold text-white hover:text-cyan-200 transition-colors truncate cursor-pointer"
                >
                  {activeNextStep.work.title}
                </h3>
                <p className="text-xs text-slate-400">
                  {activeNextStep.work.author} ·{' '}
                  {
                    getWorkPositionSummary(
                      activeNextStep.work,
                      activeNextStep.expectedFormat
                    ).formatText
                  }{' '}
                  ·{' '}
                  {
                    getWorkPositionSummary(
                      activeNextStep.work,
                      activeNextStep.expectedFormat
                    ).positionLabel
                  }
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => onStartOrContinueWork(activeNextStep.work)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs sm:text-sm transition-all cursor-pointer"
              >
                {isAudioWork(
                  activeNextStep.work,
                  activeNextStep.expectedFormat
                ) ? (
                  <Headphones className="w-4 h-4" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
                <span>
                  {
                    getWorkPositionSummary(
                      activeNextStep.work,
                      activeNextStep.expectedFormat
                    ).actionLabel
                  }
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAndSelectTrail(activeTrail.id)}
                className="inline-flex items-center justify-center min-h-[42px] px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                Abrir trilha
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
