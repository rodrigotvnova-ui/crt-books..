import { SupabaseClient } from '@supabase/supabase-js';

export interface TrailRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  objective: string;
  description: string;
  outcome_summary: string;
  category_slug: string;
  accent_color: 'cyan' | 'sky' | 'amber' | 'emerald';
  status: 'published' | 'draft' | 'archived';
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TrailStepRow {
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
  estimated_minutes: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserTrailRow {
  id: string;
  user_id: string;
  trail_id: string;
  status: 'not_started' | 'active' | 'in_progress' | 'paused' | 'completed';
  is_active: boolean;
  current_step_order: number;
  current_step_id: string | null;
  progress_percent: number;
  completed_steps_count: number;
  total_steps_count: number;
  started_at: string;
  completed_at: string | null;
  last_accessed_at: string;
  created_at: string;
  updated_at: string;
}

export interface UserTrailStepRow {
  id: string;
  user_id: string;
  trail_id: string;
  trail_step_id: string;
  work_id: string;
  status: 'not_started' | 'current' | 'in_progress' | 'completed';
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RelationalTrailsStorePayload {
  version: number;
  updated_at: string;
  trails: TrailRow[];
  trail_steps: TrailStepRow[];
  user_trails: UserTrailRow[];
  user_trail_steps: UserTrailStepRow[];
}

const TRAILS_STORAGE_BUCKET = 'crt-trails';
const TRAILS_STORAGE_OBJECT_PATH = 'relational_state_v1.json';
const SEED_TIMESTAMP = '2026-10-08T00:00:00.000Z';

export const INITIAL_TRAILS_ROWS: TrailRow[] = [
  {
    id: 'd1000000-0000-4000-8000-000000000001',
    slug: 'trilha-produtividade-foco-tempo',
    title: 'Produtividade, Foco e Gestão do Tempo',
    subtitle: 'Disciplina e Tempo',
    objective: 'Quero ganhar tempo, foco e disciplina diária',
    description:
      'Um caminho direto para alinhar sua mentalidade, blindar sua autodisciplina e aplicar táticas práticas para dominar sua rotina.',
    outcome_summary:
      'Ao concluir esta trilha, você terá base mental de crescimento, disciplina para executar nos dias difíceis e um sistema prático de gestão do tempo.',
    category_slug: 'discipline_focus',
    accent_color: 'cyan',
    status: 'published',
    is_active: true,
    display_order: 1,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000002',
    slug: 'trilha-comunicacao-persuasao',
    title: 'Comunicação, PNL e Persuasão',
    subtitle: 'Comunicação e Influência',
    objective: 'Quero me comunicar melhor e desenvolver persuasão',
    description:
      'Domine os mecanismos da linguagem, os gatilhos da persuasão humana e a leitura estratégica de comportamentos.',
    outcome_summary:
      'Você compreenderá como a mente processa mensagens, como estruturar argumentos persuasivos e como se proteger de manipulações.',
    category_slug: 'communication',
    accent_color: 'sky',
    status: 'published',
    is_active: true,
    display_order: 2,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000003',
    slug: 'trilha-mentalidade-prosperidade',
    title: 'Mentalidade de Prosperidade e Resultados',
    subtitle: 'Dinheiro e Mentalidade',
    objective: 'Quero destravar minha mentalidade para prosperar',
    description:
      'Reprograme crenças limitantes, alinhe sua atitude em relação ao dinheiro, fortaleça sua autodisciplina e alavanque seu tempo.',
    outcome_summary:
      'Uma sequência de 4 etapas pensada para alinhar visão de crescimento, inteligência com finanças, consistência e foco nas ações de maior retorno.',
    category_slug: 'money',
    accent_color: 'amber',
    status: 'published',
    is_active: true,
    display_order: 3,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000004',
    slug: 'trilha-familia-proposito-cultura',
    title: 'Família, Propósito e Visão de Mundo',
    subtitle: 'Propósito e Cultura',
    objective: 'Quero fortalecer minha família, propósito e repertório',
    description:
      'Construa relações familiares mais fortes, aprofunde seu sentido de propósito e amplie sua cultura histórica.',
    outcome_summary:
      'Equilíbrio entre base familiar sólida, resiliência espiritual e compreensão das grandes lideranças da história.',
    category_slug: 'purpose',
    accent_color: 'emerald',
    status: 'published',
    is_active: true,
    display_order: 4,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
];

export const INITIAL_TRAIL_STEPS_ROWS: TrailStepRow[] = [
  // Trilha 1 — Produtividade, Foco e Gestão do Tempo (3 etapas validadas)
  {
    id: 'e1000000-0000-4000-8000-000000000101',
    trail_id: 'd1000000-0000-4000-8000-000000000001',
    work_id: '5394d89c-8dee-437b-b72c-797c2f7d0bf9',
    asset_id: '93f8aa4b-5424-4d66-8f23-15c3f0e8b912',
    step_order: 1,
    step_number: 1,
    title: 'Mentalidade',
    step_title: 'Mentalidade',
    objective:
      'Antes de organizar a agenda, ajuste a forma como você encara desafios, erros e evolução contínua.',
    description:
      'Construa a base da mentalidade de crescimento para substituir bloqueios por aprendizado contínuo.',
    recommended_format: 'ebook',
    estimated_minutes: 180,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000102',
    trail_id: 'd1000000-0000-4000-8000-000000000001',
    work_id: 'b2d376be-4b23-4798-bb08-55d4ae711bc2',
    asset_id: '16fc655c-f500-4122-8623-88c124dcbc72',
    step_order: 2,
    step_number: 2,
    title: 'Blindagem e Autodisciplina',
    step_title: 'Blindagem e Autodisciplina',
    objective:
      'Desenvolva resistência mental e consistência inabalável para agir mesmo sem motivação.',
    description:
      'Fortaleça o autodomínio e a capacidade de manter a execução sob pressão.',
    recommended_format: 'ebook',
    estimated_minutes: 320,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000103',
    trail_id: 'd1000000-0000-4000-8000-000000000001',
    work_id: 'ebb22e64-171a-4ca3-ad9e-5ba5ff62f021',
    asset_id: 'bb8ab038-90af-4661-ad56-bf9eaf68ae2b',
    step_order: 3,
    step_number: 3,
    title: 'Execução Prática no Dia a Dia',
    step_title: 'Execução Prática no Dia a Dia',
    objective:
      'Transforme sua disciplina em horas livres e produtividade real com 60 estratégias aplicáveis imediatamente.',
    description:
      'Aplique técnicas diretas de gestão de tempo e priorização na rotina diária.',
    recommended_format: 'audio',
    estimated_minutes: 329,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },

  // Trilha 2 — Comunicação, PNL e Persuasão (3 etapas)
  {
    id: 'e1000000-0000-4000-8000-000000000201',
    trail_id: 'd1000000-0000-4000-8000-000000000002',
    work_id: 'df2aa131-4158-43c2-833a-1f235ccf6134',
    asset_id: '349fb14b-2a75-4bec-b9f5-099440c26a34',
    step_order: 1,
    step_number: 1,
    title: 'Mente, Linguagem e Conexão',
    step_title: 'Mente, Linguagem e Conexão',
    objective:
      'Comece pelos fundamentos da Programação Neurolinguística para criar clareza e sintonia imediata ao se comunicar.',
    description:
      'Domine rapport, calibração e estrutura de linguagem com PNL prática.',
    recommended_format: 'ebook',
    estimated_minutes: 150,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000202',
    trail_id: 'd1000000-0000-4000-8000-000000000002',
    work_id: '4f9ab450-5c99-486d-82aa-29f7f79f36fb',
    asset_id: 'f6cf5b77-5471-451e-835d-b4759aa05dc3',
    step_order: 2,
    step_number: 2,
    title: 'Psicologia da Influência em Escala',
    step_title: 'Psicologia da Influência em Escala',
    objective:
      'Aprofunde-se nos princípios clássicos de persuasão, retórica e condução de decisões.',
    description:
      'Compreenda os gatilhos psicológicos que movem grupos e decisões.',
    recommended_format: 'ebook',
    estimated_minutes: 210,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000203',
    trail_id: 'd1000000-0000-4000-8000-000000000002',
    work_id: 'ea38106c-f583-4c2b-b1c8-8e707b52eb64',
    asset_id: 'b063a941-c274-4c0b-8034-62124809d21e',
    step_order: 3,
    step_number: 3,
    title: 'Leitura Comportamental no Mundo Real',
    step_title: 'Leitura Comportamental no Mundo Real',
    objective:
      'Analise casos reais de engenharia social para identificar táticas de influência e blindar sua tomada de decisão.',
    description:
      'Reconheça padrões sutis de persuasão na prática e proteja sua atenção.',
    recommended_format: 'ebook',
    estimated_minutes: 280,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },

  // Trilha 3 — Mentalidade de Prosperidade e Resultados (4 etapas — demonstrando N etapas dinâmicas)
  {
    id: 'e1000000-0000-4000-8000-000000000301',
    trail_id: 'd1000000-0000-4000-8000-000000000003',
    work_id: '5394d89c-8dee-437b-b72c-797c2f7d0bf9',
    asset_id: '93f8aa4b-5424-4d66-8f23-15c3f0e8b912',
    step_order: 1,
    step_number: 1,
    title: 'Desbloqueio de Mentalidade',
    step_title: 'Desbloqueio de Mentalidade',
    objective:
      'Todo resultado financeiro começa na substituição de crenças fixas por uma mentalidade voltada ao aprendizado.',
    description:
      'Identifique e supere crenças limitantes sobre capacidade e crescimento.',
    recommended_format: 'ebook',
    estimated_minutes: 180,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000302',
    trail_id: 'd1000000-0000-4000-8000-000000000003',
    work_id: '36bb6320-2286-42f5-92df-371a38b1c757',
    asset_id: '077ce47a-68d0-43e0-9bdb-8996409c9244',
    step_order: 2,
    step_number: 2,
    title: 'Atitude e Geração de Prosperidade',
    step_title: 'Atitude e Geração de Prosperidade',
    objective:
      'Construa novos hábitos e comportamentos práticos para atrair oportunidades e lidar melhor com o dinheiro.',
    description:
      'Alinhe foco, energia e ação prática para geração de valor.',
    recommended_format: 'ebook',
    estimated_minutes: 200,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000303',
    trail_id: 'd1000000-0000-4000-8000-000000000003',
    work_id: 'b2d376be-4b23-4798-bb08-55d4ae711bc2',
    asset_id: '16fc655c-f500-4122-8623-88c124dcbc72',
    step_order: 3,
    step_number: 3,
    title: 'Autodisciplina para Sustentar Resultados',
    step_title: 'Autodisciplina para Sustentar Resultados',
    objective:
      'Prosperar exige constância inegociável: aprenda a manter a execução firme mesmo diante de obstáculos.',
    description:
      'Sustente metas de longo prazo com disciplina diária.',
    recommended_format: 'ebook',
    estimated_minutes: 320,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000304',
    trail_id: 'd1000000-0000-4000-8000-000000000003',
    work_id: 'ebb22e64-171a-4ca3-ad9e-5ba5ff62f021',
    asset_id: 'bb8ab038-90af-4661-ad56-bf9eaf68ae2b',
    step_order: 4,
    step_number: 4,
    title: 'Alavancagem do Tempo',
    step_title: 'Alavancagem do Tempo',
    objective:
      'Aprenda a liberar horas de tarefas operacionais para investir seu tempo no que realmente constrói patrimônio.',
    description:
      'Multiplique o retorno das suas horas diárias com 60 táticas práticas.',
    recommended_format: 'audio',
    estimated_minutes: 329,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },

  // Trilha 4 — Família, Propósito e Visão de Mundo (3 etapas)
  {
    id: 'e1000000-0000-4000-8000-000000000401',
    trail_id: 'd1000000-0000-4000-8000-000000000004',
    work_id: '0467b25c-7523-42ea-86b0-647103573cbc',
    asset_id: '229b1e60-c78f-4894-9c2d-6bea95f610e4',
    step_order: 1,
    step_number: 1,
    title: 'Harmonia e Base Familiar',
    step_title: 'Harmonia e Base Familiar',
    objective:
      'Comece fortalecendo o ambiente mais próximo com 15 princípios práticos de convivência e valorização familiar.',
    description:
      'Princípios essenciais para construir relacionamentos sólidos em casa.',
    recommended_format: 'ebook',
    estimated_minutes: 190,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000402',
    trail_id: 'd1000000-0000-4000-8000-000000000004',
    work_id: 'a31d9b40-3723-4aa9-9c7d-8be4a8490b9c',
    asset_id: '0feeec6f-7a65-4314-8e5b-53189fdbdd6d',
    step_order: 2,
    step_number: 2,
    title: 'Propósito, Fé e Superação',
    step_title: 'Propósito, Fé e Superação',
    objective:
      'Uma narrativa real de resiliência e renovação de sentido diante das maiores adversidades da vida.',
    description:
      'Fortaleça a esperança e a clareza de propósito.',
    recommended_format: 'ebook',
    estimated_minutes: 170,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000403',
    trail_id: 'd1000000-0000-4000-8000-000000000004',
    work_id: 'a1186545-0d76-4250-a927-a6978c124b71',
    asset_id: '0a187eda-9246-4c40-a6b1-33b152b2948e',
    step_order: 3,
    step_number: 3,
    title: 'Repertório e Liderança Histórica',
    step_title: 'Repertório e Liderança Histórica',
    objective:
      'Expanda sua visão de mundo ouvindo a trajetória de 100 figuras que transformaram os rumos da humanidade.',
    description:
      'Amplie seu repertório cultural e visão estratégica através da história.',
    recommended_format: 'audio',
    estimated_minutes: 407,
    is_required: true,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  },
];

let cachedCloudStore: RelationalTrailsStorePayload | null = null;

async function ensureCloudTrailsBucket(sb: SupabaseClient): Promise<void> {
  try {
    const { data: buckets } = await sb.storage.listBuckets();
    const exists = (buckets || []).some(
      (b) => b.name === TRAILS_STORAGE_BUCKET || b.id === TRAILS_STORAGE_BUCKET
    );
    if (!exists) {
      await sb.storage.createBucket(TRAILS_STORAGE_BUCKET, {
        public: false,
      });
    }
  } catch {
    // ignore bucket check error if already created
  }
}

async function readCloudRelationalStore(
  sb: SupabaseClient
): Promise<RelationalTrailsStorePayload> {
  await ensureCloudTrailsBucket(sb);

  try {
    const { data, error } = await sb.storage
      .from(TRAILS_STORAGE_BUCKET)
      .download(TRAILS_STORAGE_OBJECT_PATH);

    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text) as Partial<RelationalTrailsStorePayload>;

      const trailsMap = new Map<string, TrailRow>();
      for (const seedTrail of INITIAL_TRAILS_ROWS) {
        trailsMap.set(seedTrail.id, seedTrail);
      }
      for (const existingTrail of parsed.trails || []) {
        if (existingTrail?.id) {
          trailsMap.set(existingTrail.id, {
            ...trailsMap.get(existingTrail.id),
            ...existingTrail,
          } as TrailRow);
        }
      }

      const stepsMap = new Map<string, TrailStepRow>();
      for (const seedStep of INITIAL_TRAIL_STEPS_ROWS) {
        stepsMap.set(`${seedStep.trail_id}:${seedStep.step_order}`, seedStep);
      }
      for (const existingStep of parsed.trail_steps || []) {
        if (existingStep?.trail_id && existingStep?.step_order) {
          const key = `${existingStep.trail_id}:${existingStep.step_order}`;
          stepsMap.set(key, {
            ...stepsMap.get(key),
            ...existingStep,
          } as TrailStepRow);
        }
      }

      const store: RelationalTrailsStorePayload = {
        version: 1,
        updated_at: parsed.updated_at || new Date().toISOString(),
        trails: Array.from(trailsMap.values()).sort(
          (a, b) => a.display_order - b.display_order
        ),
        trail_steps: Array.from(stepsMap.values()).sort((a, b) =>
          a.trail_id === b.trail_id
            ? a.step_order - b.step_order
            : a.trail_id.localeCompare(b.trail_id)
        ),
        user_trails: Array.isArray(parsed.user_trails)
          ? parsed.user_trails
          : [],
        user_trail_steps: Array.isArray(parsed.user_trail_steps)
          ? parsed.user_trail_steps
          : [],
      };

      cachedCloudStore = store;
      return store;
    }
  } catch {
    // fallback to initial seed below
  }

  if (cachedCloudStore) {
    return cachedCloudStore;
  }

  const initialPayload: RelationalTrailsStorePayload = {
    version: 1,
    updated_at: new Date().toISOString(),
    trails: [...INITIAL_TRAILS_ROWS],
    trail_steps: [...INITIAL_TRAIL_STEPS_ROWS],
    user_trails: [],
    user_trail_steps: [],
  };

  await writeCloudRelationalStore(sb, initialPayload);
  return initialPayload;
}

async function writeCloudRelationalStore(
  sb: SupabaseClient,
  payload: RelationalTrailsStorePayload
): Promise<void> {
  payload.updated_at = new Date().toISOString();
  cachedCloudStore = payload;
  try {
    await ensureCloudTrailsBucket(sb);
    const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
    await sb.storage
      .from(TRAILS_STORAGE_BUCKET)
      .upload(TRAILS_STORAGE_OBJECT_PATH, buffer, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '0',
      });
  } catch (err) {
    console.warn(
      '[CRT Trails Supabase Store] Aviso ao gravar estado relacional no Supabase Storage:',
      err
    );
  }
}

async function checkPostgresTrailsTablesAvailable(
  sb: SupabaseClient
): Promise<boolean> {
  const { error } = await sb.from('trails').select('id').limit(1);
  return !error;
}

/**
 * Garante que `trails` e `trail_steps` estejam populados e retorna todos os registros relacionais
 * (`trails`, `trail_steps`, `user_trails`, `user_trail_steps`).
 */
export async function loadAndSeedRelationalTrails(
  sb: SupabaseClient,
  userId?: string | null
): Promise<{
  storageMode: 'postgres_tables' | 'supabase_cloud_relational_store';
  trails: TrailRow[];
  trailSteps: TrailStepRow[];
  userTrails: UserTrailRow[];
  userTrailSteps: UserTrailStepRow[];
}> {
  const hasPgTables = await checkPostgresTrailsTablesAvailable(sb);

  if (hasPgTables) {
    const { data: existingTrails } = await sb
      .from('trails')
      .select('*')
      .order('display_order', { ascending: true });

    if (!existingTrails || existingTrails.length === 0) {
      await sb.from('trails').upsert(INITIAL_TRAILS_ROWS, {
        onConflict: 'slug',
      });
      await sb.from('trail_steps').upsert(INITIAL_TRAIL_STEPS_ROWS, {
        onConflict: 'trail_id,step_order',
      });

      // Se havia registros em cloud store antes da criação das tabelas SQL, migra automaticamente
      const cloudBackup = await readCloudRelationalStore(sb);
      if (cloudBackup.user_trails.length > 0) {
        await sb.from('user_trails').upsert(cloudBackup.user_trails, {
          onConflict: 'user_id,trail_id',
        });
      }
      if (cloudBackup.user_trail_steps.length > 0) {
        await sb.from('user_trail_steps').upsert(cloudBackup.user_trail_steps, {
          onConflict: 'user_id,trail_step_id',
        });
      }
    }

    const [{ data: pgTrails }, { data: pgSteps }] = await Promise.all([
      sb
        .from('trails')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      sb
        .from('trail_steps')
        .select('*')
        .order('step_order', { ascending: true }),
    ]);

    let pgUserTrails: UserTrailRow[] = [];
    let pgUserTrailSteps: UserTrailStepRow[] = [];

    if (userId) {
      const [{ data: ut }, { data: uts }] = await Promise.all([
        sb.from('user_trails').select('*').eq('user_id', userId),
        sb.from('user_trail_steps').select('*').eq('user_id', userId),
      ]);
      pgUserTrails = (ut || []) as UserTrailRow[];
      pgUserTrailSteps = (uts || []) as UserTrailStepRow[];
    }

    return {
      storageMode: 'postgres_tables',
      trails: (pgTrails || INITIAL_TRAILS_ROWS) as TrailRow[],
      trailSteps: (pgSteps || INITIAL_TRAIL_STEPS_ROWS) as TrailStepRow[],
      userTrails: pgUserTrails,
      userTrailSteps: pgUserTrailSteps,
    };
  }

  const cloudStore = await readCloudRelationalStore(sb);
  return {
    storageMode: 'supabase_cloud_relational_store',
    trails: cloudStore.trails,
    trailSteps: cloudStore.trail_steps,
    userTrails: userId
      ? cloudStore.user_trails.filter((ut) => ut.user_id === userId)
      : [],
    userTrailSteps: userId
      ? cloudStore.user_trail_steps.filter((uts) => uts.user_id === userId)
      : [],
  };
}

function makeDeterministicUuid(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hex1 = hash.toString(16).padStart(8, '0');
  let hash2 = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash2 ^= seed.charCodeAt(i);
    hash2 = Math.imul(hash2, 16777619) >>> 0;
  }
  const hex2 = hash2.toString(16).padStart(8, '0');
  return `f1000000-${hex1.slice(0, 4)}-4${hex1.slice(4, 7)}-8${hex2.slice(0, 3)}-${hex1}${hex2.slice(0, 4)}`;
}

/**
 * Valida estritamente o UUID do usuário autenticado na sessão do Supabase.
 * NUNCA seleciona ou faz fallback para outro perfil de `public.profiles`.
 */
function validateAuthenticatedUserId(
  authenticatedUserId?: string | null
): string | null {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (authenticatedUserId && uuidRegex.test(authenticatedUserId.trim())) {
    return authenticatedUserId.trim();
  }
  return null;
}

/**
 * Calcula e sincroniza no Supabase o estado completo de:
 * SUPABASE -> TRILHA (trails) -> ETAPAS (trail_steps) -> OBRAS (works + assets + authors) -> PROGRESSO (user_progress + user_trails + user_trail_steps)
 */
export async function getHydratedTrailsFromSupabase(
  sb: SupabaseClient,
  authenticatedUserId?: string | null
) {
  const effectiveUserId = validateAuthenticatedUserId(authenticatedUserId);
  const relational = await loadAndSeedRelationalTrails(sb, effectiveUserId);

  // Carrega obras reais (`works`, `authors`, `assets`) e progresso real (`user_progress`) do PostgreSQL
  const [worksResult, progressResult] = await Promise.all([
    sb
      .from('works')
      .select(
        `
        id,
        title,
        slug,
        author_id,
        description,
        cover_url,
        language,
        status,
        rights_status,
        created_at,
        updated_at,
        authors (
          id,
          name,
          slug
        ),
        assets (
          id,
          work_id,
          asset_type,
          source_type,
          mime_type,
          file_size,
          duration_seconds,
          checksum,
          status,
          created_at,
          updated_at
        )
      `
      )
      .order('created_at', { ascending: true }),
    effectiveUserId
      ? sb.from('user_progress').select('*').eq('user_id', effectiveUserId)
      : Promise.resolve({ data: [] }),
  ]);

  const worksList = Array.isArray(worksResult.data) ? worksResult.data : [];
  const worksById = new Map<string, (typeof worksList)[number]>();
  for (const w of worksList) {
    worksById.set(String(w.id), w);
  }

  const progressList = Array.isArray(progressResult.data)
    ? progressResult.data
    : [];
  const progressByWorkId = new Map<string, (typeof progressList)[number]>();
  for (const p of progressList) {
    progressByWorkId.set(String(p.work_id), p);
  }

  // Verifica qual trilha está marcada como ativa em `user_trails` para o usuário
  let activeUserTrail = relational.userTrails.find((ut) => ut.is_active);
  const nowIso = new Date().toISOString();
  let stateModified = false;

  const updatedUserTrails: UserTrailRow[] = [];
  const updatedUserTrailSteps: UserTrailStepRow[] = [];

  // Se o usuário ainda não tem nenhuma trilha ativa em `user_trails`, inicializa a Trilha 1 como ativa
  const activeTrailIdToUse =
    activeUserTrail?.trail_id ||
    relational.trails[0]?.id ||
    'd1000000-0000-4000-8000-000000000001';

  const hydratedTrails = relational.trails.map((trail) => {
    const orderedSteps = relational.trailSteps
      .filter((s) => s.trail_id === trail.id)
      .sort((a, b) => a.step_order - b.step_order);

    let foundFirstIncomplete = false;

    const hydratedSteps = orderedSteps.map((step) => {
      const workRow = worksById.get(step.work_id) || null;
      const userProg = progressByWorkId.get(step.work_id) || null;

      const isAudio =
        step.recommended_format === 'audio' ||
        userProg?.progress_type === 'listening';
      const rawPct = userProg ? Number(userProg.progress_percent) || 0 : 0;
      const rawPos = userProg ? Number(userProg.position) || 0 : 0;
      const hasPositionProgress = isAudio ? rawPos > 0 : rawPos > 1;
      const isCompleted = Boolean(userProg?.completed) || rawPct >= 100;
      const isInProgress =
        !isCompleted && (rawPct > 0 || hasPositionProgress);

      const effectivePercent = isCompleted
        ? 100
        : rawPct > 0
        ? Math.min(99, Math.max(1, Math.round(rawPct)))
        : hasPositionProgress
        ? 1
        : 0;

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

      if (effectiveUserId) {
        const existingUts = relational.userTrailSteps.find(
          (u) =>
            u.user_id === effectiveUserId && u.trail_step_id === step.id
        );
        const mappedUtsStatus: UserTrailStepRow['status'] =
          stepStatus === 'completed'
            ? 'completed'
            : stepStatus === 'in_progress'
            ? 'in_progress'
            : stepStatus === 'current'
            ? 'current'
            : 'not_started';

        const utsRecord: UserTrailStepRow = {
          id:
            existingUts?.id ||
            makeDeterministicUuid(`uts:${effectiveUserId}:${step.id}`),
          user_id: effectiveUserId,
          trail_id: trail.id,
          trail_step_id: step.id,
          work_id: step.work_id,
          status: mappedUtsStatus,
          progress_percent: effectivePercent,
          started_at:
            existingUts?.started_at ||
            (effectivePercent > 0
              ? String(userProg?.created_at || nowIso)
              : null),
          completed_at: isCompleted
            ? existingUts?.completed_at ||
              String(userProg?.updated_at || nowIso)
            : null,
          last_accessed_at: userProg?.last_accessed_at
            ? String(userProg.last_accessed_at)
            : existingUts?.last_accessed_at || null,
          created_at: existingUts?.created_at || nowIso,
          updated_at: nowIso,
        };

        if (
          !existingUts ||
          existingUts.status !== utsRecord.status ||
          Number(existingUts.progress_percent) !== utsRecord.progress_percent
        ) {
          stateModified = true;
        }
        updatedUserTrailSteps.push(utsRecord);
      }

      return {
        ...step,
        work: workRow,
        user_progress: userProg,
        step_status: stepStatus,
        progress_percent: effectivePercent,
      };
    });

    const totalSteps = hydratedSteps.length;
    const completedStepsCount = hydratedSteps.filter(
      (s) => s.step_status === 'completed'
    ).length;
    const inProgressStepsCount = hydratedSteps.filter(
      (s) => s.step_status === 'in_progress'
    ).length;
    const sumPercentages = hydratedSteps.reduce(
      (acc, s) => acc + s.progress_percent,
      0
    );
    const overallProgressPercent =
      totalSteps > 0 ? Math.round(sumPercentages / totalSteps) : 0;

    // Determina a etapa atual recomendada: prioriza etapa em andamento mais recente, ou primeira etapa não concluída
    const inProgressSortedByRecent = [...hydratedSteps]
      .filter((s) => s.step_status === 'in_progress')
      .sort((a, b) => {
        const tA = a.user_progress?.last_accessed_at
          ? new Date(String(a.user_progress.last_accessed_at)).getTime()
          : 0;
        const tB = b.user_progress?.last_accessed_at
          ? new Date(String(b.user_progress.last_accessed_at)).getTime()
          : 0;
        if (tB !== tA) return tB - tA;
        return a.step_order - b.step_order;
      });

    const currentStep =
      inProgressSortedByRecent[0] ||
      hydratedSteps.find((s) => s.step_status === 'current') ||
      hydratedSteps.find((s) => s.step_status !== 'completed') ||
      hydratedSteps[0] ||
      null;

    let userTrailRecord: UserTrailRow | null = null;
    if (effectiveUserId) {
      const existingUt = relational.userTrails.find(
        (u) => u.user_id === effectiveUserId && u.trail_id === trail.id
      );
      const isTrailActive = trail.id === activeTrailIdToUse;
      const computedStatus: UserTrailRow['status'] =
        completedStepsCount === totalSteps && totalSteps > 0
          ? 'completed'
          : overallProgressPercent > 0 || inProgressStepsCount > 0
          ? 'in_progress'
          : isTrailActive
          ? 'active'
          : 'not_started';

      userTrailRecord = {
        id:
          existingUt?.id ||
          makeDeterministicUuid(`ut:${effectiveUserId}:${trail.id}`),
        user_id: effectiveUserId,
        trail_id: trail.id,
        status: computedStatus,
        is_active: isTrailActive,
        current_step_order: currentStep?.step_order || 1,
        current_step_id: currentStep?.id || null,
        progress_percent: overallProgressPercent,
        completed_steps_count: completedStepsCount,
        total_steps_count: totalSteps,
        started_at: existingUt?.started_at || nowIso,
        completed_at:
          computedStatus === 'completed'
            ? existingUt?.completed_at || nowIso
            : null,
        last_accessed_at: existingUt?.last_accessed_at || nowIso,
        created_at: existingUt?.created_at || nowIso,
        updated_at: nowIso,
      };

      if (
        !existingUt ||
        existingUt.is_active !== userTrailRecord.is_active ||
        existingUt.status !== userTrailRecord.status ||
        Number(existingUt.progress_percent) !==
          userTrailRecord.progress_percent ||
        existingUt.current_step_order !== userTrailRecord.current_step_order ||
        existingUt.completed_steps_count !==
          userTrailRecord.completed_steps_count
      ) {
        stateModified = true;
      }

      updatedUserTrails.push(userTrailRecord);
      if (isTrailActive) {
        activeUserTrail = userTrailRecord;
      }
    }

    return {
      ...trail,
      steps: hydratedSteps,
      user_trail: userTrailRecord,
      completed_steps_count: completedStepsCount,
      in_progress_steps_count: inProgressStepsCount,
      total_steps_count: totalSteps,
      overall_progress_percent: overallProgressPercent,
      current_step_order: currentStep?.step_order || 1,
      current_step_id: currentStep?.id || null,
    };
  });

  if (effectiveUserId && stateModified) {
    if (relational.storageMode === 'postgres_tables') {
      await Promise.all([
        sb.from('user_trails').upsert(updatedUserTrails, {
          onConflict: 'user_id,trail_id',
        }),
        sb.from('user_trail_steps').upsert(updatedUserTrailSteps, {
          onConflict: 'user_id,trail_step_id',
        }),
      ]);
    } else {
      const cloudStore = await readCloudRelationalStore(sb);
      const otherUserTrails = cloudStore.user_trails.filter(
        (u) => u.user_id !== effectiveUserId
      );
      const otherUserTrailSteps = cloudStore.user_trail_steps.filter(
        (u) => u.user_id !== effectiveUserId
      );
      cloudStore.user_trails = [...otherUserTrails, ...updatedUserTrails];
      cloudStore.user_trail_steps = [
        ...otherUserTrailSteps,
        ...updatedUserTrailSteps,
      ];
      await writeCloudRelationalStore(sb, cloudStore);
    }
  }

  const activeTrailObj =
    hydratedTrails.find((t) => t.id === activeTrailIdToUse) ||
    hydratedTrails[0] ||
    null;

  return {
    ok: true,
    storageMode: relational.storageMode,
    userId: effectiveUserId,
    activeTrailId: activeTrailObj?.id || null,
    activeTrailSlug: activeTrailObj?.slug || null,
    activeUserTrail: activeUserTrail || null,
    trails: hydratedTrails,
    tables: {
      trails: relational.trails,
      trail_steps: relational.trailSteps,
      user_trails: updatedUserTrails,
      user_trail_steps: updatedUserTrailSteps,
    },
  };
}

/**
 * Seleciona e persiste a trilha ativa do usuário no Supabase (`user_trails`)
 */
export async function selectActiveTrailForUserInSupabase(
  sb: SupabaseClient,
  authenticatedUserId: string | null | undefined,
  trailIdOrSlug: string
) {
  const effectiveUserId = validateAuthenticatedUserId(authenticatedUserId);
  if (!effectiveUserId) {
    throw new Error('Usuário autenticado inválido para seleção de trilha.');
  }
  const relational = await loadAndSeedRelationalTrails(sb, effectiveUserId);

  const targetTrail = relational.trails.find(
    (t) =>
      t.id === trailIdOrSlug ||
      t.slug.toLowerCase() === trailIdOrSlug.trim().toLowerCase()
  );

  if (!targetTrail) {
    throw new Error(`Trilha '${trailIdOrSlug}' não encontrada no Supabase.`);
  }

  if (effectiveUserId) {
    const nowIso = new Date().toISOString();

    if (relational.storageMode === 'postgres_tables') {
      await sb
        .from('user_trails')
        .update({ is_active: false, updated_at: nowIso })
        .eq('user_id', effectiveUserId);

      const existing = relational.userTrails.find(
        (u) => u.user_id === effectiveUserId && u.trail_id === targetTrail.id
      );

      await sb.from('user_trails').upsert(
        {
          id:
            existing?.id ||
            makeDeterministicUuid(`ut:${effectiveUserId}:${targetTrail.id}`),
          user_id: effectiveUserId,
          trail_id: targetTrail.id,
          status:
            existing?.status && existing.status !== 'not_started'
              ? existing.status
              : 'active',
          is_active: true,
          current_step_order: existing?.current_step_order || 1,
          current_step_id: existing?.current_step_id || null,
          progress_percent: existing?.progress_percent || 0,
          completed_steps_count: existing?.completed_steps_count || 0,
          total_steps_count: existing?.total_steps_count || 3,
          started_at: existing?.started_at || nowIso,
          last_accessed_at: nowIso,
          created_at: existing?.created_at || nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'user_id,trail_id' }
      );
    } else {
      const cloudStore = await readCloudRelationalStore(sb);
      let foundTarget = false;

      cloudStore.user_trails = cloudStore.user_trails.map((ut) => {
        if (ut.user_id !== effectiveUserId) return ut;
        if (ut.trail_id === targetTrail.id) {
          foundTarget = true;
          return {
            ...ut,
            is_active: true,
            status: ut.status === 'not_started' ? 'active' : ut.status,
            last_accessed_at: nowIso,
            updated_at: nowIso,
          };
        }
        return {
          ...ut,
          is_active: false,
          updated_at: nowIso,
        };
      });

      if (!foundTarget) {
        const stepsCount = cloudStore.trail_steps.filter(
          (s) => s.trail_id === targetTrail.id
        ).length;
        cloudStore.user_trails.push({
          id: makeDeterministicUuid(`ut:${effectiveUserId}:${targetTrail.id}`),
          user_id: effectiveUserId,
          trail_id: targetTrail.id,
          status: 'active',
          is_active: true,
          current_step_order: 1,
          current_step_id: null,
          progress_percent: 0,
          completed_steps_count: 0,
          total_steps_count: stepsCount,
          started_at: nowIso,
          completed_at: null,
          last_accessed_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      await writeCloudRelationalStore(sb, cloudStore);
    }
  }

  return getHydratedTrailsFromSupabase(sb, effectiveUserId);
}
