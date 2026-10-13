import React, { useMemo, useState } from 'react';
import { Bookmark, RefreshCw, Sparkles, X } from 'lucide-react';
import { HOME_GOALS } from '../data/mockData';
import {
  ActiveTab,
  GoalItem,
  OnboardingPreferences,
  Work,
} from '../types/models';
import { ContinueCard } from '../components/ContinueCard';
import { GoalCard } from '../components/GoalCard';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';

interface HomeScreenProps {
  userName?: string;
  works: Work[];
  libraryWorks?: Work[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetryLoad?: () => void;
  preferences: OnboardingPreferences;
  onSelectWork: (work: Work) => void;
  onContinueWork: (work: Work) => void;
  onToggleSave: (work: Work) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

const GOAL_KEYWORDS_MAP: Record<string, string[]> = {
  foco: ['foco', 'hábitos', 'habitos', 'produtividade', 'disciplina', 'mentalidade'],
  disciplina: ['disciplina', 'hábitos', 'habitos', 'produtividade', 'mentalidade'],
  financas: ['dinheiro', 'finanças', 'financas', 'rico', 'patrimônio'],
  vendas: ['vendas', 'vendedor', 'persuasão', 'persuasao', 'persuadir', 'negociação'],
  comunicacao: [
    'comunicação',
    'comunicacao',
    'neurolinguística',
    'neurolinguistica',
    'persuasão',
    'persuasao',
    'persuadir',
    'vendedor',
  ],
};

function matchesGoalWithRealWork(work: Work, goal: GoalItem): boolean {
  if (
    goal.recommendedWorkIds.includes(work.id) ||
    (work.slug && goal.recommendedWorkIds.includes(work.slug)) ||
    work.relatedGoalIds.includes(goal.id)
  ) {
    return true;
  }

  const keywords = GOAL_KEYWORDS_MAP[goal.id] || [goal.label.toLowerCase()];
  const haystack = [
    work.title,
    work.slug || '',
    ...work.categories,
    ...work.tags,
  ]
    .join(' ')
    .toLowerCase();

  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userName,
  works,
  libraryWorks = [],
  isLoading = false,
  errorMessage = null,
  onRetryLoad,
  preferences,
  onSelectWork,
  onContinueWork,
  onToggleSave,
  onNavigateTab,
}) => {
  const [selectedGoal, setSelectedGoal] = useState<GoalItem | null>(null);

  const catalogWorks = useMemo(
    () => (libraryWorks.length > 0 ? libraryWorks : works),
    [libraryWorks, works]
  );

  const realInProgressWorks = useMemo(
    () =>
      catalogWorks
        .filter(
          (w) =>
            w.progress > 0 ||
            (typeof w.position === 'number' &&
              (w.progressType === 'listening'
                ? w.position > 0
                : w.position > 1)) ||
            w.status === 'in_progress'
        )
        .sort((a, b) => {
          const timeA = a.lastAccessedAt
            ? new Date(a.lastAccessedAt).getTime()
            : 0;
          const timeB = b.lastAccessedAt
            ? new Date(b.lastAccessedAt).getTime()
            : 0;
          if (timeB !== timeA) return timeB - timeA;
          return (b.position || 0) - (a.position || 0);
        }),
    [catalogWorks]
  );

  const primaryContinueWork =
    realInProgressWorks[0] || catalogWorks[0] || null;

  const recommendedWorks = useMemo(() => {
    if (catalogWorks.length === 0) return [];
    const sorted = [...catalogWorks].sort((a, b) => {
      const aClassified = a.categories.length + a.tags.length > 0 ? 1 : 0;
      const bClassified = b.categories.length + b.tags.length > 0 ? 1 : 0;
      if (bClassified !== aClassified) return bClassified - aClassified;
      const aHasCover = a.cover ? 1 : 0;
      const bHasCover = b.cover ? 1 : 0;
      return bHasCover - aHasCover;
    });
    return sorted.slice(0, 6);
  }, [catalogWorks]);

  const savedCount = useMemo(
    () => catalogWorks.filter((w) => w.isSaved).length,
    [catalogWorks]
  );

  const initials =
    (userName || 'Visitante CRT')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join('') || 'VC';

  const goalRecommendedWorks = useMemo(() => {
    if (!selectedGoal || catalogWorks.length === 0) return [];
    const matched = catalogWorks.filter((w) =>
      matchesGoalWithRealWork(w, selectedGoal)
    );
    return matched.length > 0 ? matched : catalogWorks.slice(0, 2);
  }, [catalogWorks, selectedGoal]);

  return (
    <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-200">
      {/* Top Greeting Header */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              Olá{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
            </h1>
            {preferences.dailyTime && (
              <span className="hidden sm:inline-block text-xs text-slate-400 font-mono-tabular">
                · Meta diária: {preferences.dailyTime}
              </span>
            )}
          </div>
          <p className="text-sm sm:text-base text-slate-300">
            O que vamos desenvolver hoje?
          </p>
        </div>

        {/* Right Actions: Quick link to Minha Lista + Small Avatar */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('my-list')}
            aria-label="Abrir Minha Lista"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0E131F]/90 hover:bg-[#151D2E] border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Bookmark className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Minha Lista</span>
            <span className="font-mono-tabular text-cyan-400 font-semibold">
              ({savedCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('profile')}
            aria-label="Ir para o Perfil"
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500/25 via-[#131C2E] to-[#0A0E17] border border-cyan-400/35 flex items-center justify-center text-xs font-display font-bold text-cyan-300 hover:border-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.12)] cursor-pointer"
          >
            {initials}
          </button>
        </div>
      </div>

      {isLoading && catalogWorks.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl bg-[#0E131F]/60 border border-white/[0.06]">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
          <p className="text-sm font-medium text-slate-200">
            Carregando acervo real do Supabase...
          </p>
        </div>
      ) : errorMessage && catalogWorks.length === 0 ? (
        <EmptyState
          title="Não foi possível carregar o catálogo inicial"
          description={errorMessage}
          actionLabel={onRetryLoad ? 'Tentar novamente' : undefined}
          onAction={onRetryLoad}
        />
      ) : (
        <>
          {/* SEÇÃO 1: Continue de onde parou */}
          <section>
            <SectionHeader
              title="Continue de onde parou"
              actionLabel="Minha Lista"
              onAction={() => onNavigateTab('my-list')}
            />
            {primaryContinueWork ? (
              <ContinueCard
                work={primaryContinueWork}
                onContinue={onContinueWork}
                onSelectWork={onSelectWork}
              />
            ) : (
              <EmptyState
                title="Nenhuma obra disponível no momento"
                description="Explore a biblioteca para iniciar sua jornada de leitura ou áudio."
                actionLabel="Ir para Biblioteca"
                onAction={() => onNavigateTab('library')}
              />
            )}
          </section>

          {/* SEÇÃO 2: O que você precisa hoje? (Bento Cards) */}
          <section>
            <SectionHeader
              title="O que você precisa hoje?"
              subtitle="Escolha um objetivo imediato para filtrar o conhecimento ideal"
            />

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-3.5">
              {HOME_GOALS.map((goal, index) => {
                const spanClass =
                  index === 0
                    ? 'col-span-2 sm:col-span-3'
                    : index === 1
                    ? 'col-span-1 sm:col-span-3'
                    : 'col-span-1 sm:col-span-2';

                return (
                  <div key={goal.id} className={spanClass}>
                    <GoalCard
                      goal={goal}
                      isSelected={selectedGoal?.id === goal.id}
                      onSelect={(g) =>
                        setSelectedGoal((prev) =>
                          prev?.id === g.id ? null : g
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>

            {/* Obras reais ao clicar em um Bento Card de objetivo */}
            {selectedGoal && (
              <div className="mt-4 rounded-3xl bg-[#111827]/95 border border-cyan-400/35 p-5 sm:p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 shadow-[0_20px_45px_rgba(0,0,0,0.65)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-cyan-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>CAMINHO RECOMENDADO PARA: {selectedGoal.label}</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-display font-bold text-white">
                      “{selectedGoal.statement}”
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300">
                      {selectedGoal.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedGoal(null)}
                    aria-label="Fechar recomendação de objetivo"
                    className="min-w-[40px] min-h-[40px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {goalRecommendedWorks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {goalRecommendedWorks.map((work) => (
                      <ContentCard
                        key={work.id}
                        work={work}
                        layout="list"
                        onSelect={onSelectWork}
                        onToggleSave={onToggleSave}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Nenhuma obra encontrada para este objetivo no momento.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* SEÇÃO 3: Recomendado para você */}
          <section>
            <SectionHeader
              title="Recomendado para você"
              subtitle="Obras essenciais alinhadas ao seu momento atual"
              actionLabel="Explorar tudo"
              onAction={() => onNavigateTab('explore')}
            />

            {recommendedWorks.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                {recommendedWorks.map((work) => (
                  <ContentCard
                    key={work.id}
                    work={work}
                    layout="carousel"
                    onSelect={onSelectWork}
                    onToggleSave={onToggleSave}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem recomendações disponíveis"
                description="O acervo ainda não possui obras disponíveis para recomendação."
                actionLabel="Explorar catálogo"
                onAction={() => onNavigateTab('explore')}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
};
