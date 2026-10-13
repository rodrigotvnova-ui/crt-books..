import React, { useMemo, useState } from 'react';
import { Bookmark, RefreshCw } from 'lucide-react';
import { ActiveTab, Work } from '../types/models';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';
import { SearchBar } from '../components/SearchBar';

interface LibraryScreenProps {
  works: Work[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetryLoad?: () => void;
  onSelectWork: (work: Work) => void;
  onToggleSave: (work: Work) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

type FormatFilter = 'all' | 'ebook' | 'audio';

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  works,
  isLoading = false,
  errorMessage = null,
  onRetryLoad,
  onSelectWork,
  onToggleSave,
  onNavigateTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const categoriesList = useMemo(() => {
    const unique = new Set<string>();
    for (const w of works) {
      for (const c of w.categories) {
        if (c && c.trim()) unique.add(c.trim());
      }
    }
    return unique.size > 0 ? ['Todas', ...Array.from(unique)] : [];
  }, [works]);

  const filteredWorks = useMemo(() => {
    return works.filter((work) => {
      const matchesFormat =
        formatFilter === 'all'
          ? true
          : work.availableFormats.includes(formatFilter);

      const matchesCategory =
        categoryFilter === 'Todas' || categoriesList.length === 0
          ? true
          : work.categories.some(
              (c) => c.toLowerCase() === categoryFilter.toLowerCase()
            );

      const matchesSearch = normalizedQuery
        ? work.title.toLowerCase().includes(normalizedQuery) ||
          work.author.toLowerCase().includes(normalizedQuery) ||
          (work.slug && work.slug.toLowerCase().includes(normalizedQuery))
        : true;

      return matchesFormat && matchesCategory && matchesSearch;
    });
  }, [works, formatFilter, categoryFilter, categoriesList.length, normalizedQuery]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Biblioteca
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Acervo unificado por obra · Ebook e Audiobook integrados
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab('my-list')}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-2xl bg-[#0E131F] hover:bg-[#151D2E] border border-white/[0.08] text-xs font-medium text-cyan-300 transition-colors shrink-0 cursor-pointer"
        >
          <Bookmark className="w-4 h-4" />
          <span>Minha Lista</span>
        </button>
      </div>

      {/* Search Field */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Buscar por título ou autor..."
      />

      {/* Interactive Format Segmented Filter + Category Filter */}
      <div className="space-y-3">
        {/* Format Filter: Todos | Ebooks | Audiobooks */}
        <div className="inline-flex p-1 rounded-2xl bg-[#0E131F] border border-white/[0.08] w-full sm:w-auto">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'ebook', label: 'Ebooks' },
            { id: 'audio', label: 'Audiobooks' },
          ].map((tab) => {
            const active = formatFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormatFilter(tab.id as FormatFilter)}
                className={`flex-1 sm:flex-initial min-h-[40px] px-5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Category Horizontal Filter (exibido quando houver categorias associadas) */}
        {categoriesList.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {categoriesList.map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-300'
                      : 'bg-[#0E131F]/70 hover:bg-[#131B2E] border-white/[0.07] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/[0.06] pb-3">
        <span>
          Exibindo{' '}
          <strong className="text-white font-mono-tabular">
            {filteredWorks.length}
          </strong>{' '}
          {filteredWorks.length === 1 ? 'obra única' : 'obras únicas'}
        </span>
        {(formatFilter !== 'all' ||
          categoryFilter !== 'Todas' ||
          normalizedQuery.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setFormatFilter('all');
              setCategoryFilter('Todas');
              setSearchQuery('');
            }}
            className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
          >
            Redefinir filtros
          </button>
        )}
      </div>

      {/* Works Grid / Loading / Error / Empty */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl bg-[#0E131F]/60 border border-white/[0.06]">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
          <p className="text-sm font-medium text-slate-200">
            Carregando acervo real do Supabase...
          </p>
        </div>
      ) : errorMessage ? (
        <EmptyState
          title="Não foi possível carregar a Biblioteca"
          description={errorMessage}
          actionLabel={onRetryLoad ? 'Tentar novamente' : undefined}
          onAction={onRetryLoad}
        />
      ) : filteredWorks.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredWorks.map((work) => (
            <ContentCard
              key={work.id}
              work={work}
              layout="grid"
              onSelect={onSelectWork}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma obra corresponde aos filtros"
          description="Tente alterar o formato selecionado ou buscar por outro título ou autor."
          actionLabel="Mostrar todas as obras"
          onAction={() => {
            setFormatFilter('all');
            setCategoryFilter('Todas');
            setSearchQuery('');
          }}
        />
      )}
    </div>
  );
};
