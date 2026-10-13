import { Work } from '../types/models';
import { getSupabaseAuthHeaders } from '../services/supabase';

export interface TrailStepDefinition {
  id: string;
  trailId: string;
  stepNumber: number;
  stepOrder: number;
  stepTitle: string;
  rationale: string;
  description?: string;
  workId: string;
  assetId?: string | null;
  workSlugFallback: string;
  workTitleFallback: string;
  authorFallback: string;
  expectedFormat: 'ebook' | 'audio';
  durationSecondsFallback?: number;
}

export interface LearningTrailDefinition {
  id: string;
  slug: string;
  title: string;
  questionStatement: string;
  shortLabel: string;
  description: string;
  outcomeSummary: string;
  accentColor: 'cyan' | 'sky' | 'amber' | 'emerald';
  relatedInterestNames: string[];
  steps: TrailStepDefinition[];
}

export interface ResolvedTrailStep extends TrailStepDefinition {
  work: Work;
  stepStatus: 'completed' | 'in_progress' | 'current' | 'upcoming';
  progressPercent: number;
}

export interface ResolvedLearningTrail extends LearningTrailDefinition {
  resolvedSteps: ResolvedTrailStep[];
  completedCount: number;
  inProgressCount: number;
  totalSteps: number;
  overallProgressPercent: number;
  nextStep: ResolvedTrailStep | null;
  isActiveInSupabase?: boolean;
}

/**
 * Semente relacional inicial da Fase 8B utilizando obras reais do catálogo Supabase (8 ebooks PDF + 2 audiobooks MP3).
 * Sincronizada com `public.trails` e `public.trail_steps`.
 */
export const CURATED_LEARNING_TRAILS: LearningTrailDefinition[] = [
  {
    id: 'd1000000-0000-4000-8000-000000000001',
    slug: 'trilha-produtividade-foco-tempo',
    title: 'Produtividade, Foco e Gestão do Tempo',
    questionStatement: 'Quero ganhar tempo, foco e disciplina diária',
    shortLabel: 'Disciplina e Tempo',
    description:
      'Um caminho direto para alinhar sua mentalidade, blindar sua autodisciplina e aplicar táticas práticas para dominar sua rotina.',
    outcomeSummary:
      'Ao concluir esta trilha, você terá base mental de crescimento, disciplina para executar nos dias difíceis e um sistema prático de gestão do tempo.',
    accentColor: 'cyan',
    relatedInterestNames: ['Disciplina e foco', 'Mentalidade'],
    steps: [
      {
        id: 'e1000000-0000-4000-8000-000000000101',
        trailId: 'd1000000-0000-4000-8000-000000000001',
        stepNumber: 1,
        stepOrder: 1,
        stepTitle: 'Mentalidade',
        rationale:
          'Antes de organizar a agenda, ajuste a forma como você encara desafios, erros e evolução contínua.',
        workId: '5394d89c-8dee-437b-b72c-797c2f7d0bf9',
        assetId: '93f8aa4b-5424-4d66-8f23-15c3f0e8b912',
        workSlugFallback: 'mindset-a-mentalidade-de-crescimento',
        workTitleFallback: 'Mindset a Mentalidade de Crescimento',
        authorFallback: 'Davidson Renato',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000102',
        trailId: 'd1000000-0000-4000-8000-000000000001',
        stepNumber: 2,
        stepOrder: 2,
        stepTitle: 'Blindagem e Autodisciplina',
        rationale:
          'Desenvolva resistência mental e consistência inabalável para agir mesmo sem motivação.',
        workId: 'b2d376be-4b23-4798-bb08-55d4ae711bc2',
        assetId: '16fc655c-f500-4122-8623-88c124dcbc72',
        workSlugFallback: 'nada-pode-me-ferir',
        workTitleFallback: 'Nada Pode Me Ferir',
        authorFallback: 'David Goggins',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000103',
        trailId: 'd1000000-0000-4000-8000-000000000001',
        stepNumber: 3,
        stepOrder: 3,
        stepTitle: 'Execução Prática no Dia a Dia',
        rationale:
          'Transforme sua disciplina em horas livres e produtividade real com 60 estratégias aplicáveis imediatamente.',
        workId: 'ebb22e64-171a-4ca3-ad9e-5ba5ff62f021',
        assetId: 'bb8ab038-90af-4661-ad56-bf9eaf68ae2b',
        workSlugFallback: '60-estrategias-praticas-para-ganhar-mais-tempo',
        workTitleFallback: '60 Estratégias Práticas para Ganhar mais Tempo',
        authorFallback: 'Christian Barbosa',
        expectedFormat: 'audio',
        durationSecondsFallback: 19743,
      },
    ],
  },
  {
    id: 'd1000000-0000-4000-8000-000000000002',
    slug: 'trilha-comunicacao-persuasao',
    title: 'Comunicação, PNL e Persuasão',
    questionStatement: 'Quero me comunicar melhor e desenvolver persuasão',
    shortLabel: 'Comunicação e Influência',
    description:
      'Domine os mecanismos da linguagem, os gatilhos da persuasão humana e a leitura estratégica de comportamentos.',
    outcomeSummary:
      'Você compreenderá como a mente processa mensagens, como estruturar argumentos persuasivos e como se proteger de manipulações.',
    accentColor: 'sky',
    relatedInterestNames: ['Comunicação', 'Negócios e vendas'],
    steps: [
      {
        id: 'e1000000-0000-4000-8000-000000000201',
        trailId: 'd1000000-0000-4000-8000-000000000002',
        stepNumber: 1,
        stepOrder: 1,
        stepTitle: 'Mente, Linguagem e Conexão',
        rationale:
          'Comece pelos fundamentos da Programação Neurolinguística para criar clareza e sintonia imediata ao se comunicar.',
        workId: 'df2aa131-4158-43c2-833a-1f235ccf6134',
        assetId: '349fb14b-2a75-4bec-b9f5-099440c26a34',
        workSlugFallback: 'guia-pratico-de-programacao-neurolinguistica',
        workTitleFallback: 'Guia Pratico de Programacao Neurolinguística',
        authorFallback: 'Luiz Felipe Carvalho',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000202',
        trailId: 'd1000000-0000-4000-8000-000000000002',
        stepNumber: 2,
        stepOrder: 2,
        stepTitle: 'Psicologia da Influência em Escala',
        rationale:
          'Aprofunde-se nos princípios clássicos de persuasão, retórica e condução de decisões.',
        workId: '4f9ab450-5c99-486d-82aa-29f7f79f36fb',
        assetId: 'f6cf5b77-5471-451e-835d-b4759aa05dc3',
        workSlugFallback: 'como-manipular-e-persuadir-milhares-de-pessoas',
        workTitleFallback: 'Como Manipular e Persuadir Milhares de Pessoas',
        authorFallback: 'Acervo CRT Books',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000203',
        trailId: 'd1000000-0000-4000-8000-000000000002',
        stepNumber: 3,
        stepOrder: 3,
        stepTitle: 'Leitura Comportamental no Mundo Real',
        rationale:
          'Analise casos reais de engenharia social para identificar táticas de influência e blindar sua tomada de decisão.',
        workId: 'ea38106c-f583-4c2b-b1c8-8e707b52eb64',
        assetId: 'b063a941-c274-4c0b-8034-62124809d21e',
        workSlugFallback: 'a-arte-de-enganar',
        workTitleFallback: 'A Arte de Enganar',
        authorFallback: 'Kevin Mitnick e William L. Simon',
        expectedFormat: 'ebook',
      },
    ],
  },
  {
    id: 'd1000000-0000-4000-8000-000000000003',
    slug: 'trilha-mentalidade-prosperidade',
    title: 'Mentalidade de Prosperidade e Resultados',
    questionStatement: 'Quero destravar minha mentalidade para prosperar',
    shortLabel: 'Dinheiro e Mentalidade',
    description:
      'Reprograme crenças limitantes, alinhe sua atitude em relação ao dinheiro, fortaleça sua autodisciplina e alavanque seu tempo.',
    outcomeSummary:
      'Uma sequência de 4 etapas pensada para alinhar visão de crescimento, inteligência com finanças, consistência e foco nas ações de maior retorno.',
    accentColor: 'amber',
    relatedInterestNames: ['Dinheiro', 'Mentalidade', 'Negócios e vendas'],
    steps: [
      {
        id: 'e1000000-0000-4000-8000-000000000301',
        trailId: 'd1000000-0000-4000-8000-000000000003',
        stepNumber: 1,
        stepOrder: 1,
        stepTitle: 'Desbloqueio de Mentalidade',
        rationale:
          'Todo resultado financeiro começa na substituição de crenças fixas por uma mentalidade voltada ao aprendizado.',
        workId: '5394d89c-8dee-437b-b72c-797c2f7d0bf9',
        assetId: '93f8aa4b-5424-4d66-8f23-15c3f0e8b912',
        workSlugFallback: 'mindset-a-mentalidade-de-crescimento',
        workTitleFallback: 'Mindset a Mentalidade de Crescimento',
        authorFallback: 'Davidson Renato',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000302',
        trailId: 'd1000000-0000-4000-8000-000000000003',
        stepNumber: 2,
        stepOrder: 2,
        stepTitle: 'Atitude e Geração de Prosperidade',
        rationale:
          'Construa novos hábitos e comportamentos práticos para atrair oportunidades e lidar melhor com o dinheiro.',
        workId: '36bb6320-2286-42f5-92df-371a38b1c757',
        assetId: '077ce47a-68d0-43e0-9bdb-8996409c9244',
        workSlugFallback: 'como-ser-um-ima-para-o-dinheiro',
        workTitleFallback: 'Como Ser um Imã para o Dinheiro',
        authorFallback: 'Bruno Gimenes',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000303',
        trailId: 'd1000000-0000-4000-8000-000000000003',
        stepNumber: 3,
        stepOrder: 3,
        stepTitle: 'Autodisciplina para Sustentar Resultados',
        rationale:
          'Prosperar exige constância inegociável: aprenda a manter a execução firme mesmo diante de obstáculos.',
        workId: 'b2d376be-4b23-4798-bb08-55d4ae711bc2',
        assetId: '16fc655c-f500-4122-8623-88c124dcbc72',
        workSlugFallback: 'nada-pode-me-ferir',
        workTitleFallback: 'Nada Pode Me Ferir',
        authorFallback: 'David Goggins',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000304',
        trailId: 'd1000000-0000-4000-8000-000000000003',
        stepNumber: 4,
        stepOrder: 4,
        stepTitle: 'Alavancagem do Tempo',
        rationale:
          'Aprenda a liberar horas de tarefas operacionais para investir seu tempo no que realmente constrói patrimônio.',
        workId: 'ebb22e64-171a-4ca3-ad9e-5ba5ff62f021',
        assetId: 'bb8ab038-90af-4661-ad56-bf9eaf68ae2b',
        workSlugFallback: '60-estrategias-praticas-para-ganhar-mais-tempo',
        workTitleFallback: '60 Estratégias Práticas para Ganhar mais Tempo',
        authorFallback: 'Christian Barbosa',
        expectedFormat: 'audio',
        durationSecondsFallback: 19743,
      },
    ],
  },
  {
    id: 'd1000000-0000-4000-8000-000000000004',
    slug: 'trilha-familia-proposito-cultura',
    title: 'Família, Propósito e Visão de Mundo',
    questionStatement: 'Quero fortalecer minha família, propósito e repertório',
    shortLabel: 'Propósito e Cultura',
    description:
      'Construa relações familiares mais fortes, aprofunde seu sentido de propósito e amplie sua cultura histórica.',
    outcomeSummary:
      'Equilíbrio entre base familiar sólida, resiliência espiritual e compreensão das grandes lideranças da história.',
    accentColor: 'emerald',
    relatedInterestNames: [
      'Relacionamentos',
      'Propósito',
      'Cultura e conhecimento',
    ],
    steps: [
      {
        id: 'e1000000-0000-4000-8000-000000000401',
        trailId: 'd1000000-0000-4000-8000-000000000004',
        stepNumber: 1,
        stepOrder: 1,
        stepTitle: 'Harmonia e Base Familiar',
        rationale:
          'Comece fortalecendo o ambiente mais próximo com 15 princípios práticos de convivência e valorização familiar.',
        workId: '0467b25c-7523-42ea-86b0-647103573cbc',
        assetId: '229b1e60-c78f-4894-9c2d-6bea95f610e4',
        workSlugFallback: '15-licoes-para-fortalecer-sua-familia',
        workTitleFallback: '15 Lições para Fortalecer Sua Família',
        authorFallback: 'Acervo CRT Books',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000402',
        trailId: 'd1000000-0000-4000-8000-000000000004',
        stepNumber: 2,
        stepOrder: 2,
        stepTitle: 'Propósito, Fé e Superação',
        rationale:
          'Uma narrativa real de resiliência e renovação de sentido diante das maiores adversidades da vida.',
        workId: 'a31d9b40-3723-4aa9-9c7d-8be4a8490b9c',
        assetId: '0feeec6f-7a65-4314-8e5b-53189fdbdd6d',
        workSlugFallback: '90-minutos-no-ceu',
        workTitleFallback: '90 Minutos no Ceu',
        authorFallback: 'Don Piper',
        expectedFormat: 'ebook',
      },
      {
        id: 'e1000000-0000-4000-8000-000000000403',
        trailId: 'd1000000-0000-4000-8000-000000000004',
        stepNumber: 3,
        stepOrder: 3,
        stepTitle: 'Repertório e Liderança Histórica',
        rationale:
          'Expanda sua visão de mundo ouvindo a trajetória de 100 figuras que transformaram os rumos da humanidade.',
        workId: 'a1186545-0d76-4250-a927-a6978c124b71',
        assetId: '0a187eda-9246-4c40-a6b1-33b152b2948e',
        workSlugFallback: '100-homens-que-a-historia-do-mundo',
        workTitleFallback: '100 Homens que a História do Mundo',
        authorFallback: 'Bill Yenne',
        expectedFormat: 'audio',
        durationSecondsFallback: 24450,
      },
    ],
  },
];

function isWorkStartedOrCompleted(work: Work): {
  isCompleted: boolean;
  isInProgress: boolean;
  effectivePercent: number;
} {
  const isAudio = work.progressType === 'listening';
  const hasPositionProgress =
    typeof work.position === 'number' &&
    (isAudio ? work.position > 0 : work.position > 1);
  const isCompleted = work.status === 'completed' || work.progress >= 100;
  const isInProgress =
    !isCompleted &&
    (work.status === 'in_progress' || work.progress > 0 || hasPositionProgress);

  const effectivePercent = isCompleted
    ? 100
    : work.progress > 0
    ? Math.min(99, Math.max(1, Math.round(work.progress)))
    : hasPositionProgress
    ? 1
    : 0;

  return { isCompleted, isInProgress, effectivePercent };
}

function createFallbackWorkForStep(step: TrailStepDefinition): Work {
  const isAudio = step.expectedFormat === 'audio';
  return {
    id: step.workId,
    slug: step.workSlugFallback,
    title: step.workTitleFallback,
    author: step.authorFallback,
    coverTheme: {
      primaryColor: isAudio ? '#0D1F2D' : '#111827',
      secondaryColor: '#090D16',
      accentHex: '#22D3EE',
      motif: isAudio ? 'wave' : 'monolith',
    },
    description: step.rationale,
    categories: [isAudio ? 'Audiobook' : 'Ebook'],
    tags: [],
    benefits: [],
    availableFormats: [step.expectedFormat],
    assets: step.durationSecondsFallback
      ? [
          {
            id: step.assetId || `fallback-asset-${step.workId}`,
            workId: step.workId,
            format: step.expectedFormat,
            mimeType: isAudio ? 'audio/mpeg' : 'application/pdf',
            durationOrPages: `${Math.round(step.durationSecondsFallback / 60)} min`,
            durationMinutes: Math.round(step.durationSecondsFallback / 60),
            durationSeconds: step.durationSecondsFallback,
            sourceType: 'google_drive',
            fileSize: 0,
            status: 'active',
          },
        ]
      : [],
    progress: 0,
    progressType: isAudio ? 'listening' : 'reading',
    duration: isAudio ? 'Audiobook MP3' : 'Ebook PDF',
    status: 'not_started',
    isSaved: false,
    relatedGoalIds: [],
  };
}

export function resolveLearningTrails(
  libraryWorks: Work[],
  sourceDefinitions: LearningTrailDefinition[] = CURATED_LEARNING_TRAILS,
  activeTrailIdOrSlug?: string | null
): ResolvedLearningTrail[] {
  return sourceDefinitions.map((trail) => {
    let foundFirstIncomplete = false;

    const sortedSteps = [...trail.steps].sort(
      (a, b) => a.stepOrder - b.stepOrder
    );

    const resolvedSteps: ResolvedTrailStep[] = sortedSteps.map((step) => {
      const matchedWork =
        libraryWorks.find((w) => w.id === step.workId) ||
        libraryWorks.find(
          (w) =>
            w.slug &&
            w.slug.toLowerCase() === step.workSlugFallback.toLowerCase()
        ) ||
        libraryWorks.find(
          (w) =>
            w.title.trim().toLowerCase() ===
            step.workTitleFallback.trim().toLowerCase()
        ) ||
        createFallbackWorkForStep(step);

      const { isCompleted, isInProgress, effectivePercent } =
        isWorkStartedOrCompleted(matchedWork);

      let stepStatus: 'completed' | 'in_progress' | 'current' | 'upcoming';
      if (isCompleted) {
        stepStatus = 'completed';
      } else if (isInProgress) {
        stepStatus = 'in_progress';
        foundFirstIncomplete = true;
      } else if (!foundFirstIncomplete) {
        stepStatus = 'current';
        foundFirstIncomplete = true;
      } else {
        stepStatus = 'upcoming';
      }

      return {
        ...step,
        work: matchedWork,
        stepStatus,
        progressPercent: effectivePercent,
      };
    });

    const completedCount = resolvedSteps.filter(
      (s) => s.stepStatus === 'completed'
    ).length;
    const inProgressCount = resolvedSteps.filter(
      (s) => s.stepStatus === 'in_progress'
    ).length;
    const totalSteps = resolvedSteps.length;

    const sumPercentages = resolvedSteps.reduce(
      (acc, s) => acc + s.progressPercent,
      0
    );
    const overallProgressPercent =
      totalSteps > 0 ? Math.round(sumPercentages / totalSteps) : 0;

    const inProgressByRecent = [...resolvedSteps]
      .filter((s) => s.stepStatus === 'in_progress')
      .sort((a, b) => {
        const tA = a.work.lastAccessedAt
          ? new Date(a.work.lastAccessedAt).getTime()
          : 0;
        const tB = b.work.lastAccessedAt
          ? new Date(b.work.lastAccessedAt).getTime()
          : 0;
        if (tB !== tA) return tB - tA;
        return a.stepOrder - b.stepOrder;
      });

    const nextStep =
      inProgressByRecent[0] ||
      resolvedSteps.find((s) => s.stepStatus === 'current') ||
      resolvedSteps.find((s) => s.stepStatus !== 'completed') ||
      resolvedSteps[0] ||
      null;

    const isActiveInSupabase = Boolean(
      activeTrailIdOrSlug &&
        (trail.id === activeTrailIdOrSlug ||
          trail.slug.toLowerCase() === activeTrailIdOrSlug.toLowerCase())
    );

    return {
      ...trail,
      resolvedSteps,
      completedCount,
      inProgressCount,
      totalSteps,
      overallProgressPercent,
      nextStep,
      isActiveInSupabase,
    };
  });
}

export interface BackendRelationalTrailStep {
  id: string;
  trail_id: string;
  work_id: string;
  asset_id: string | null;
  step_order: number;
  step_number: number;
  title: string;
  step_title: string;
  objective: string;
  description: string;
  recommended_format: 'ebook' | 'audio' | 'both';
  work?: {
    id: string;
    title: string;
    slug: string;
    cover_url?: string | null;
    authors?: { name?: string } | Array<{ name?: string }> | null;
    assets?: Array<{
      id: string;
      asset_type: string;
      duration_seconds?: number | null;
    }> | null;
  } | null;
}

export interface BackendRelationalTrail {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  objective: string;
  description: string;
  outcome_summary: string;
  category_slug: string;
  accent_color: 'cyan' | 'sky' | 'amber' | 'emerald';
  steps: BackendRelationalTrailStep[];
}

export interface BackendTrailsResponse {
  ok: boolean;
  storageMode?: string;
  userId?: string | null;
  activeTrailId?: string | null;
  activeTrailSlug?: string | null;
  trails?: BackendRelationalTrail[];
}

function mapCategorySlugToInterests(categorySlug: string): string[] {
  switch (categorySlug) {
    case 'discipline_focus':
      return ['Disciplina e foco', 'Mentalidade'];
    case 'communication':
      return ['Comunicação', 'Negócios e vendas'];
    case 'money':
      return ['Dinheiro', 'Mentalidade', 'Negócios e vendas'];
    case 'purpose':
      return ['Relacionamentos', 'Propósito', 'Cultura e conhecimento'];
    default:
      return ['Disciplina e foco'];
  }
}

export function mapBackendTrailsToDefinitions(
  backendTrails: BackendRelationalTrail[]
): LearningTrailDefinition[] {
  if (!Array.isArray(backendTrails) || backendTrails.length === 0) {
    return CURATED_LEARNING_TRAILS;
  }

  return backendTrails.map((bt) => {
    const orderedSteps = [...(bt.steps || [])].sort(
      (a, b) => a.step_order - b.step_order
    );

    const mappedSteps: TrailStepDefinition[] = orderedSteps.map((s) => {
      const workObj = s.work;
      const authorObj = Array.isArray(workObj?.authors)
        ? workObj?.authors[0]
        : workObj?.authors;
      const audioAsset = (workObj?.assets || []).find(
        (a) => a.asset_type === 'audio'
      );
      const isAudio =
        s.recommended_format === 'audio' || Boolean(audioAsset);

      return {
        id: s.id,
        trailId: s.trail_id || bt.id,
        stepNumber: s.step_order || s.step_number || 1,
        stepOrder: s.step_order || s.step_number || 1,
        stepTitle: s.title || s.step_title || `Etapa ${s.step_order}`,
        rationale: s.objective || s.description || '',
        description: s.description || s.objective || '',
        workId: s.work_id,
        assetId: s.asset_id,
        workSlugFallback: workObj?.slug || s.work_id,
        workTitleFallback: workObj?.title || `Obra ${s.step_order}`,
        authorFallback: authorObj?.name || 'Acervo CRT Books',
        expectedFormat: isAudio ? 'audio' : 'ebook',
        durationSecondsFallback: audioAsset?.duration_seconds
          ? Number(audioAsset.duration_seconds)
          : undefined,
      };
    });

    return {
      id: bt.id,
      slug: bt.slug,
      title: bt.title,
      questionStatement: bt.objective || bt.title,
      shortLabel: bt.subtitle || bt.title,
      description: bt.description || '',
      outcomeSummary: bt.outcome_summary || '',
      accentColor: bt.accent_color || 'cyan',
      relatedInterestNames: mapCategorySlugToInterests(bt.category_slug),
      steps: mappedSteps,
    };
  });
}

export async function fetchRelationalTrailsFromBackend(
  _userId?: string | null
): Promise<{
  definitions: LearningTrailDefinition[];
  activeTrailId: string | null;
  activeTrailSlug: string | null;
} | null> {
  try {
    const authHeaders = await getSupabaseAuthHeaders();
    if (!authHeaders.Authorization) return null;

    const res = await fetch('/api/trails', {
      headers: authHeaders,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendTrailsResponse;
    if (!data?.ok || !Array.isArray(data.trails)) return null;

    return {
      definitions: mapBackendTrailsToDefinitions(data.trails),
      activeTrailId: data.activeTrailId || null,
      activeTrailSlug: data.activeTrailSlug || null,
    };
  } catch {
    return null;
  }
}

export async function selectActiveTrailInBackend(
  _userId: string | null | undefined,
  trailIdOrSlug: string
): Promise<{
  definitions: LearningTrailDefinition[];
  activeTrailId: string | null;
  activeTrailSlug: string | null;
} | null> {
  try {
    const authHeaders = await getSupabaseAuthHeaders({
      'Content-Type': 'application/json',
    });
    if (!authHeaders.Authorization) return null;

    const res = await fetch('/api/trails/select', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        trailId: trailIdOrSlug,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendTrailsResponse;
    if (!data?.ok || !Array.isArray(data.trails)) return null;

    return {
      definitions: mapBackendTrailsToDefinitions(data.trails),
      activeTrailId: data.activeTrailId || null,
      activeTrailSlug: data.activeTrailSlug || null,
    };
  } catch {
    return null;
  }
}

export function findTrailByIdOrSlug<
  T extends { id: string; slug?: string }
>(trails: T[], idOrSlug: string | null | undefined): T | null {
  if (!idOrSlug) return null;
  const normalized = idOrSlug.trim().toLowerCase();
  return (
    trails.find(
      (t) =>
        t.id.toLowerCase() === normalized ||
        (t.slug && t.slug.toLowerCase() === normalized)
    ) || null
  );
}
