import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EXPLORE_CATEGORIES } from '../data/mockData';
import { CategoryItem, Work } from '../types/models';
import { CategoryCard } from '../components/CategoryCard';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';
import { SearchBar } from '../components/SearchBar';
import { SectionHeader } from '../components/SectionHeader';

interface ExploreScreenProps {
  works: Work[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetryLoad?: () => void;
  onSelectWork: (work: Work) => void;
  onToggleSave: (work: Work) => void;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  'desenvolvimento pessoal': [
    'desenvolvimento pessoal',
    'autodesenvolvimento',
    'hábitos',
    'habitos',
  ],
  negócios: ['negócios', 'negocios', 'vendas', 'negociação', 'negociacao'],
  finanças: ['finanças', 'financas', 'dinheiro', 'patrimônio'],
  produtividade: ['produtividade', 'disciplina', 'foco', 'hábitos', 'habitos'],
  comunicação: [
    'comunicação',
    'comunicacao',
    'persuasão',
    'persuasao',
    'programação neurolinguística',
    'programacao neurolinguistica',
  ],
  filosofia: ['filosofia', 'mentalidade'],
  relacionamentos: ['relacionamentos', 'família', 'familia'],
  literatura: ['literatura'],
  espiritualidade: ['espiritualidade', 'propósito', 'proposito'],
};

function workMatchesCategoryFilter(work: Work, categoryName: string): boolean {
  const target = categoryName.trim().toLowerCase();
  if (!target) return true;

  if (
    work.categories.some(
      (c) =>
        c.toLowerCase() === target ||
        c.toLowerCase().includes(target) ||
        target.includes(c.toLowerCase())
    )
  ) {
    return true;
  }

  if (work.tags.some((t) => t.toLowerCase() === target)) {
    return true;
  }

  const aliases = CATEGORY_ALIASES[target];
  if (aliases && aliases.length > 0) {
    return (
      work.categories.some((c) =>
        aliases.some((alias) => c.toLowerCase().includes(alias))
      ) ||
      work.tags.some((t) =>
        aliases.some((alias) => t.toLowerCase().includes(alias))
      )
    );
  }

  return false;
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({
  works,
  isLoading = false,
  errorMessage = null,
  onRetryLoad,
  onSelectWork,
  onToggleSave,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const categoriesWithRealCounts = useMemo(() => {
    const items: Array<{ category: CategoryItem; count: number }> = [];
    const seenNames = new Set<string>();

    // 1. Incluir categorias reais gravadas no Supabase (work_categories)
    for (const w of works) {
      for (const realCat of w.categories) {
        const cleanName = realCat.trim();
        const lower = cleanName.toLowerCase();
        if (!cleanName || seenNames.has(lower)) continue;
        seenNames.add(lower);

        const preset = EXPLORE_CATEGORIES.find(
          (ec) => ec.name.toLowerCase() === lower
        );
        const categoryItem: CategoryItem = preset || {
          id: cleanName,
          name: cleanName,
          subtitle: 'Classificação verificada no acervo',
          countLabel: 'Catálogo real',
        };
        const count = works.filter((work) =>
          workMatchesCategoryFilter(work, cleanName)
        ).length;
        items.push({ category: categoryItem, count });
      }
    }

    // 2. Complementar com pilares de EXPLORE_CATEGORIES usando contagem real
    for (const preset of EXPLORE_CATEGORIES) {
      const lower = preset.name.toLowerCase();
      if (seenNames.has(lower)) continue;
      seenNames.add(lower);
      const count = works.filter((work) =>
        workMatchesCategoryFilter(work, preset.name)
      ).length;
      items.push({ category: preset, count });
    }

    return items.sort((a, b) => b.count - a.count);
  }, [works]);

  const filteredWorks = useMemo(() => {
    return works.filter((work) => {
      const matchesCategory = selectedCategory
        ? workMatchesCategoryFilter(work, selectedCategory)
        : true;

      const matchesSearch = normalizedQuery
        ? work.title.toLowerCase().includes(normalizedQuery) ||
          work.author.toLowerCase().includes(normalizedQuery) ||
          (work.slug && work.slug.toLowerCase().includes(normalizedQuery)) ||
          work.categories.some((c) =>
            c.toLowerCase().includes(normalizedQuery)
          ) ||
          work.tags.some((t) => t.toLowerCase().includes(normalizedQuery))
        : true;

      return matchesCategory && matchesSearch;
    });
  }, [works, selectedCategory, normalizedQuery]);

  const featuredWorks = useMemo(() => {
    const explicitFeatured = works.filter((w) => w.featured);
    if (explicitFeatured.length > 0) return explicitFeatured;

    const sorted = [...works].sort((a, b) => {
      const aClassified = a.categories.length + a.tags.length > 0 ? 1 : 0;
      const bClassified = b.categories.length + b.tags.length > 0 ? 1 : 0;
      if (bClassified !== aClassified) return bClassified - aClassified;
      const aHasCover = a.cover ? 1 : 0;
      const bHasCover = b.cover ? 1 : 0;
      return bHasCover - aHasCover;
    });
    return sorted.slice(0, 6);
  }, [works]);

  const audioWorks = useMemo(
    () => works.filter((w) => w.availableFormats.includes('audio')),
    [works]
  );

  const ebookWorks = useMemo(
    () => works.filter((w) => w.availableFormats.includes('ebook')),
    [works]
  );

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory((prev) =>
      prev === categoryName ? null : categoryName
    );
  };

  return (
    <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-200">
      {/* Header + Search */}
      <div className="space-y-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Explorar
          </h1>
          <p className="text-sm sm:text-base text-slate-300 mt-1">
            O que você quer descobrir?
          </p>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Buscar conhecimento..."
        />
      </div>

      {isLoading && works.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl bg-[#0E131F]/60 border border-white/[0.06]">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
          <p className="text-sm font-medium text-slate-200">
            Carregando acervo real do Supabase...
          </p>
        </div>
      ) : errorMessage && works.length === 0 ? (
        <EmptyState
          title="Não foi possível carregar o catálogo"
          description={errorMessage}
          actionLabel={onRetryLoad ? 'Tentar novamente' : undefined}
          onAction={onRetryLoad}
        />
      ) : works.length === 0 ? (
        <EmptyState
          title="Nenhuma obra disponível no catálogo"
          description="Não há obras cadastradas para exibição neste momento."
          actionLabel={onRetryLoad ? 'Atualizar catálogo' : undefined}
          onAction={onRetryLoad}
        />
      ) : (
        <>
          {/* Categorias */}
          <section>
            <SectionHeader
              title="Categorias"
              subtitle="Navegue por pilares fundamentais de evolução"
              actionLabel={selectedCategory ? 'Limpar filtro' : undefined}
              onAction={
                selectedCategory ? () => setSelectedCategory(null) : undefined
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {categoriesWithRealCounts.map(({ category, count }) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  isActive={selectedCategory === category.name}
                  workCount={count}
                  onSelect={handleCategoryClick}
                />
              ))}
            </div>
          </section>

          {/* Se houver busca ou categoria selecionada, mostrar resultados filtrados no topo */}
          {(normalizedQuery.length > 0 || selectedCategory) && (
            <section className="rounded-3xl bg-[#0E131F]/60 border border-cyan-400/25 p-5 sm:p-6">
              <SectionHeader
                title={
                  selectedCategory
                    ? `Conhecimento em: ${selectedCategory}`
                    : 'Resultados da busca'
                }
                subtitle={`${filteredWorks.length} ${
                  filteredWorks.length === 1
                    ? 'obra encontrada'
                    : 'obras encontradas'
                }`}
                actionLabel="Mostrar tudo"
                onAction={() => {
                  setSelectedCategory(null);
                  setSearchQuery('');
                }}
              />

              {filteredWorks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {filteredWorks.map((work) => (
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
                  title="Nenhuma obra encontrada para este filtro"
                  description="Experimente buscar por outro termo ou explorar todas as categorias disponíveis."
                  actionLabel="Limpar filtros"
                  onAction={() => {
                    setSelectedCategory(null);
                    setSearchQuery('');
                  }}
                />
              )}
            </section>
          )}

          {/* Em destaque (Carrossel horizontal) */}
          <section>
            <SectionHeader
              title="Em destaque"
              subtitle="As obras de maior impacto na plataforma"
            />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
              {featuredWorks.map((work) => (
                <ContentCard
                  key={work.id}
                  work={work}
                  layout="carousel"
                  onSelect={onSelectWork}
                  onToggleSave={onToggleSave}
                />
              ))}
            </div>
          </section>

          {/* Para ouvir (Carrossel horizontal) */}
          <section>
            <SectionHeader
              title="Para ouvir"
              subtitle="Evolua no trânsito, caminhada ou momentos de pausa"
            />
            {audioWorks.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                {audioWorks.map((work) => (
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
              <p className="text-xs text-slate-400">
                Nenhum audiobook disponível no momento.
              </p>
            )}
          </section>

          {/* Para ler (Carrossel horizontal) */}
          <section>
            <SectionHeader
              title="Para ler"
              subtitle="Imersão profunda e estruturada em texto"
            />
            {ebookWorks.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                {ebookWorks.map((work) => (
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
              <p className="text-xs text-slate-400">
                Nenhum ebook disponível no momento.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
};
