import React, { useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ActiveTab, Work } from '../types/models';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';

interface MyListScreenProps {
  works: Work[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetryLoad?: () => void;
  onSelectWork: (work: Work) => void;
  onToggleSave: (work: Work) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

type ListSection = 'continue' | 'saved' | 'completed';

export const MyListScreen: React.FC<MyListScreenProps> = ({
  works,
  isLoading = false,
  errorMessage = null,
  onRetryLoad,
  onSelectWork,
  onToggleSave,
  onNavigateTab,
}) => {
  const [activeSection, setActiveSection] = useState<ListSection>('saved');

  const continueWorks = useMemo(
    () =>
      works.filter(
        (w) =>
          w.status === 'in_progress' ||
          (w.progress > 0 && w.progress < 100) ||
          (typeof w.position === 'number' &&
            w.status !== 'completed' &&
            (w.progressType === 'listening' ? w.position > 0 : w.position > 1))
      ),
    [works]
  );

  const savedWorks = useMemo(() => works.filter((w) => w.isSaved), [works]);

  const completedWorks = useMemo(
    () => works.filter((w) => w.status === 'completed' || w.progress === 100),
    [works]
  );

  const currentList =
    activeSection === 'continue'
      ? continueWorks
      : activeSection === 'saved'
      ? savedWorks
      : completedWorks;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Minha Lista
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gerencie seus conteúdos em andamento, salvos e concluídos
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab('home')}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0E131F] hover:bg-[#151D2E] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Início</span>
        </button>
      </div>

      {/* Segmented Tabs: Continuar | Salvos | Concluídos */}
      <div className="grid grid-cols-3 p-1 rounded-2xl bg-[#0E131F] border border-white/[0.08]">
        {[
          {
            id: 'continue',
            label: 'Continuar',
            count: continueWorks.length,
          },
          {
            id: 'saved',
            label: 'Salvos',
            count: savedWorks.length,
          },
          {
            id: 'completed',
            label: 'Concluídos',
            count: completedWorks.length,
          },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as ListSection)}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-cyan-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`font-mono-tabular text-[11px] ${
                  isActive ? 'text-slate-900 font-bold' : 'text-slate-500'
                }`}
              >
                ({tab.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Works List / Loading / Error / Empty */}
      {isLoading && works.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl bg-[#0E131F]/60 border border-white/[0.06]">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
          <p className="text-sm font-medium text-slate-200">
            Sincronizando sua lista com o Supabase...
          </p>
        </div>
      ) : errorMessage && works.length === 0 ? (
        <EmptyState
          title="Não foi possível carregar Minha Lista"
          description={errorMessage}
          actionLabel={onRetryLoad ? 'Tentar novamente' : undefined}
          onAction={onRetryLoad}
        />
      ) : currentList.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {currentList.map((work) => (
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
        <EmptyState
          title={
            activeSection === 'continue'
              ? 'Nenhum conteúdo em andamento'
              : activeSection === 'saved'
              ? 'Sua lista de salvos está vazia'
              : 'Nenhum conteúdo concluído ainda'
          }
          description={
            activeSection === 'saved'
              ? 'Toque no ícone de coração em qualquer obra para salvá-la na sua lista pessoal.'
              : 'Explore o catálogo para encontrar o conhecimento ideal para o seu momento.'
          }
          actionLabel="Explorar obras"
          onAction={() => onNavigateTab('explore')}
        />
      )}
    </div>
  );
};
