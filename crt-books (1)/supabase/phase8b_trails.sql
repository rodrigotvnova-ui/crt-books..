-- ============================================================================
-- CRT BOOKS — FASE 8B: ARQUITETURA DEFINITIVA DE MINHA TRILHA NO SUPABASE
-- Modelagem relacional escalável (1 Trilha -> N Etapas em ordem -> Obras Reais -> Progresso do Usuário)
-- Suporta trilhas com 3, 5, 7, 10 ou mais etapas sem colunas fixas (step_1, step_2, etc.).
-- ============================================================================

-- 1. TABELA: public.trails
CREATE TABLE IF NOT EXISTS public.trails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  objective TEXT NOT NULL,
  description TEXT,
  outcome_summary TEXT,
  category_slug TEXT,
  accent_color TEXT DEFAULT 'cyan' CHECK (accent_color IN ('cyan', 'sky', 'amber', 'emerald', 'indigo')),
  status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trails_slug ON public.trails(slug);
CREATE INDEX IF NOT EXISTS idx_trails_status_order ON public.trails(status, is_active, display_order);

-- 2. TABELA: public.trail_steps
-- Relacionamento 1:N escalável com public.trails e vínculo direto com public.works e public.assets
CREATE TABLE IF NOT EXISTS public.trail_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trail_id UUID NOT NULL REFERENCES public.trails(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  step_order INTEGER NOT NULL CHECK (step_order >= 1),
  step_number INTEGER NOT NULL DEFAULT 1 CHECK (step_number >= 1),
  title TEXT NOT NULL,
  step_title TEXT NOT NULL,
  objective TEXT,
  description TEXT,
  recommended_format TEXT DEFAULT 'ebook' CHECK (recommended_format IN ('ebook', 'audio', 'both')),
  estimated_minutes INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trail_id, step_order),
  UNIQUE (trail_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_trail_steps_trail_order ON public.trail_steps(trail_id, step_order ASC);
CREATE INDEX IF NOT EXISTS idx_trail_steps_work_id ON public.trail_steps(work_id);

-- 3. TABELA: public.user_trails
-- Persistência da trilha escolhida/ativa pelo usuário e seu progresso consolidado na jornada
CREATE TABLE IF NOT EXISTS public.user_trails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trail_id UUID NOT NULL REFERENCES public.trails(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('not_started', 'active', 'in_progress', 'paused', 'completed')),
  is_active BOOLEAN DEFAULT TRUE,
  current_step_order INTEGER DEFAULT 1 CHECK (current_step_order >= 1),
  current_step_id UUID REFERENCES public.trail_steps(id) ON DELETE SET NULL,
  progress_percent NUMERIC DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed_steps_count INTEGER DEFAULT 0 CHECK (completed_steps_count >= 0),
  total_steps_count INTEGER DEFAULT 0 CHECK (total_steps_count >= 0),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, trail_id)
);

CREATE INDEX IF NOT EXISTS idx_user_trails_user_active ON public.user_trails(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_trails_trail_id ON public.user_trails(trail_id);

-- 4. TABELA: public.user_trail_steps
-- Persistência do status e progresso de cada etapa individual da trilha por usuário
CREATE TABLE IF NOT EXISTS public.user_trail_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trail_id UUID NOT NULL REFERENCES public.trails(id) ON DELETE CASCADE,
  trail_step_id UUID NOT NULL REFERENCES public.trail_steps(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'current', 'in_progress', 'completed')),
  progress_percent NUMERIC DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, trail_step_id)
);

CREATE INDEX IF NOT EXISTS idx_user_trail_steps_user_trail ON public.user_trail_steps(user_id, trail_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — MINHA TRILHA
-- ============================================================================

ALTER TABLE public.trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trail_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trail_steps ENABLE ROW LEVEL SECURITY;

-- Trails & Trail Steps: leitura liberada para usuários autenticados e catálogo
DROP POLICY IF EXISTS "Trails readable by all authenticated" ON public.trails;
CREATE POLICY "Trails readable by all authenticated" ON public.trails
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Trail steps readable by all authenticated" ON public.trail_steps;
CREATE POLICY "Trail steps readable by all authenticated" ON public.trail_steps
  FOR SELECT USING (true);

-- User Trails: cada usuário lê e altera exclusivamente suas próprias trilhas
DROP POLICY IF EXISTS "Users can view own trails" ON public.user_trails;
CREATE POLICY "Users can view own trails" ON public.user_trails
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own trails" ON public.user_trails;
CREATE POLICY "Users can insert own trails" ON public.user_trails
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own trails" ON public.user_trails;
CREATE POLICY "Users can update own trails" ON public.user_trails
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own trails" ON public.user_trails;
CREATE POLICY "Users can delete own trails" ON public.user_trails
  FOR DELETE USING (auth.uid() = user_id);

-- User Trail Steps: cada usuário lê e altera exclusivamente seu progresso por etapa
DROP POLICY IF EXISTS "Users can view own trail steps" ON public.user_trail_steps;
CREATE POLICY "Users can view own trail steps" ON public.user_trail_steps
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own trail steps" ON public.user_trail_steps;
CREATE POLICY "Users can insert own trail steps" ON public.user_trail_steps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own trail steps" ON public.user_trail_steps;
CREATE POLICY "Users can update own trail steps" ON public.user_trail_steps
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own trail steps" ON public.user_trail_steps;
CREATE POLICY "Users can delete own trail steps" ON public.user_trail_steps
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- SEED INICIAL IDEMPOTENTE COM OBRAS REAIS DO SUPABASE
-- ============================================================================

INSERT INTO public.trails (
  id, slug, title, subtitle, objective, description, outcome_summary, category_slug, accent_color, status, is_active, display_order
) VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    'trilha-produtividade-foco-tempo',
    'Produtividade, Foco e Gestão do Tempo',
    'Disciplina e Tempo',
    'Quero ganhar tempo, foco e disciplina diária',
    'Um caminho direto para alinhar sua mentalidade, blindar sua autodisciplina e aplicar táticas práticas para dominar sua rotina.',
    'Ao concluir esta trilha, você terá base mental de crescimento, disciplina para executar nos dias difíceis e um sistema prático de gestão do tempo.',
    'discipline_focus',
    'cyan',
    'published',
    TRUE,
    1
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'trilha-comunicacao-persuasao',
    'Comunicação, PNL e Persuasão',
    'Comunicação e Influência',
    'Quero me comunicar melhor e desenvolver persuasão',
    'Domine os mecanismos da linguagem, os gatilhos da persuasão humana e a leitura estratégica de comportamentos.',
    'Você compreenderá como a mente processa mensagens, como estruturar argumentos persuasivos e como se proteger de manipulações.',
    'communication',
    'sky',
    'published',
    TRUE,
    2
  ),
  (
    'd1000000-0000-4000-8000-000000000003',
    'trilha-mentalidade-prosperidade',
    'Mentalidade de Prosperidade e Resultados',
    'Dinheiro e Mentalidade',
    'Quero destravar minha mentalidade para prosperar',
    'Reprograme crenças limitantes, alinhe sua atitude em relação ao dinheiro, fortaleça sua autodisciplina e alavanque seu tempo.',
    'Uma sequência de 4 etapas pensada para alinhar visão de crescimento, inteligência com finanças, consistência e foco nas ações de maior retorno.',
    'money',
    'amber',
    'published',
    TRUE,
    3
  ),
  (
    'd1000000-0000-4000-8000-000000000004',
    'trilha-familia-proposito-cultura',
    'Família, Propósito e Visão de Mundo',
    'Propósito e Cultura',
    'Quero fortalecer minha família, propósito e repertório',
    'Construa relações familiares mais fortes, aprofunde seu sentido de propósito e amplie sua cultura histórica.',
    'Equilíbrio entre base familiar sólida, resiliência espiritual e compreensão das grandes lideranças da história.',
    'purpose',
    'emerald',
    'published',
    TRUE,
    4
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  objective = EXCLUDED.objective,
  description = EXCLUDED.description,
  outcome_summary = EXCLUDED.outcome_summary,
  category_slug = EXCLUDED.category_slug,
  accent_color = EXCLUDED.accent_color,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- Etapas da Trilha 1 (3 etapas: Mentalidade -> Blindagem e Autodisciplina -> Execução Prática no Dia a Dia)
INSERT INTO public.trail_steps (
  id, trail_id, work_id, asset_id, step_order, step_number, title, step_title, objective, description, recommended_format, estimated_minutes
) VALUES
  (
    'e1000000-0000-4000-8000-000000000101',
    'd1000000-0000-4000-8000-000000000001',
    '5394d89c-8dee-437b-b72c-797c2f7d0bf9',
    '93f8aa4b-5424-4d66-8f23-15c3f0e8b912',
    1, 1,
    'Mentalidade',
    'Mentalidade',
    'Antes de organizar a agenda, ajuste a forma como você encara desafios, erros e evolução contínua.',
    'Construa a base da mentalidade de crescimento para substituir bloqueios por aprendizado contínuo.',
    'ebook',
    180
  ),
  (
    'e1000000-0000-4000-8000-000000000102',
    'd1000000-0000-4000-8000-000000000001',
    'b2d376be-4b23-4798-bb08-55d4ae711bc2',
    '16fc655c-f500-4122-8623-88c124dcbc72',
    2, 2,
    'Blindagem e Autodisciplina',
    'Blindagem e Autodisciplina',
    'Desenvolva resistência mental e consistência inabalável para agir mesmo sem motivação.',
    'Fortaleça o autodomínio e a capacidade de manter a execução sob pressão.',
    'ebook',
    320
  ),
  (
    'e1000000-0000-4000-8000-000000000103',
    'd1000000-0000-4000-8000-000000000001',
    'ebb22e64-171a-4ca3-ad9e-5ba5ff62f021',
    'bb8ab038-90af-4661-ad56-bf9eaf68ae2b',
    3, 3,
    'Execução Prática no Dia a Dia',
    'Execução Prática no Dia a Dia',
    'Transforme sua disciplina em horas livres e produtividade real com 60 estratégias aplicáveis imediatamente.',
    'Aplique técnicas diretas de gestão de tempo e priorização na rotina diária.',
    'audio',
    329
  ),

  -- Etapas da Trilha 2 (3 etapas: Comunicação, PNL e Persuasão)
  (
    'e1000000-0000-4000-8000-000000000201',
    'd1000000-0000-4000-8000-000000000002',
    'df2aa131-4158-43c2-833a-1f235ccf6134',
    '349fb14b-2a75-4bec-b9f5-099440c26a34',
    1, 1,
    'Mente, Linguagem e Conexão',
    'Mente, Linguagem e Conexão',
    'Comece pelos fundamentos da Programação Neurolinguística para criar clareza e sintonia imediata ao se comunicar.',
    'Domine rapport, calibração e estrutura de linguagem com PNL prática.',
    'ebook',
    150
  ),
  (
    'e1000000-0000-4000-8000-000000000202',
    'd1000000-0000-4000-8000-000000000002',
    '4f9ab450-5c99-486d-82aa-29f7f79f36fb',
    'f6cf5b77-5471-451e-835d-b4759aa05dc3',
    2, 2,
    'Psicologia da Influência em Escala',
    'Psicologia da Influência em Escala',
    'Aprofunde-se nos princípios clássicos de persuasão, retórica e condução de decisões.',
    'Compreenda os gatilhos psicológicos que movem grupos e decisões.',
    'ebook',
    210
  ),
  (
    'e1000000-0000-4000-8000-000000000203',
    'd1000000-0000-4000-8000-000000000002',
    'ea38106c-f583-4c2b-b1c8-8e707b52eb64',
    'b063a941-c274-4c0b-8034-62124809d21e',
    3, 3,
    'Leitura Comportamental no Mundo Real',
    'Leitura Comportamental no Mundo Real',
    'Analise casos reais de engenharia social para identificar táticas de influência e blindar sua tomada de decisão.',
    'Reconheça padrões sutis de persuasão na prática e proteja sua atenção.',
    'ebook',
    280
  ),

  -- Etapas da Trilha 3 (4 etapas: demonstrando escalabilidade N etapas sem limite fixo)
  (
    'e1000000-0000-4000-8000-000000000301',
    'd1000000-0000-4000-8000-000000000003',
    '5394d89c-8dee-437b-b72c-797c2f7d0bf9',
    '93f8aa4b-5424-4d66-8f23-15c3f0e8b912',
    1, 1,
    'Desbloqueio de Mentalidade',
    'Desbloqueio de Mentalidade',
    'Todo resultado financeiro começa na substituição de crenças fixas por uma mentalidade voltada ao aprendizado.',
    'Identifique e supere crenças limitantes sobre capacidade e crescimento.',
    'ebook',
    180
  ),
  (
    'e1000000-0000-4000-8000-000000000302',
    'd1000000-0000-4000-8000-000000000003',
    '36bb6320-2286-42f5-92df-371a38b1c757',
    '077ce47a-68d0-43e0-9bdb-8996409c9244',
    2, 2,
    'Atitude e Geração de Prosperidade',
    'Atitude e Geração de Prosperidade',
    'Construa novos hábitos e comportamentos práticos para atrair oportunidades e lidar melhor com o dinheiro.',
    'Alinhe foco, energia e ação prática para geração de valor.',
    'ebook',
    200
  ),
  (
    'e1000000-0000-4000-8000-000000000303',
    'd1000000-0000-4000-8000-000000000003',
    'b2d376be-4b23-4798-bb08-55d4ae711bc2',
    '16fc655c-f500-4122-8623-88c124dcbc72',
    3, 3,
    'Autodisciplina para Sustentar Resultados',
    'Autodisciplina para Sustentar Resultados',
    'Prosperar exige constância inegociável: aprenda a manter a execução firme mesmo diante de obstáculos.',
    'Sustente metas de longo prazo com disciplina diária.',
    'ebook',
    320
  ),
  (
    'e1000000-0000-4000-8000-000000000304',
    'd1000000-0000-4000-8000-000000000003',
    'ebb22e64-171a-4ca3-ad9e-5ba5ff62f021',
    'bb8ab038-90af-4661-ad56-bf9eaf68ae2b',
    4, 4,
    'Alavancagem do Tempo',
    'Alavancagem do Tempo',
    'Aprenda a liberar horas de tarefas operacionais para investir seu tempo no que realmente constrói patrimônio.',
    'Multiplique o retorno das suas horas diárias com 60 táticas práticas.',
    'audio',
    329
  ),

  -- Etapas da Trilha 4 (3 etapas: Família, Propósito e Visão de Mundo)
  (
    'e1000000-0000-4000-8000-000000000401',
    'd1000000-0000-4000-8000-000000000004',
    '0467b25c-7523-42ea-86b0-647103573cbc',
    '229b1e60-c78f-4894-9c2d-6bea95f610e4',
    1, 1,
    'Harmonia e Base Familiar',
    'Harmonia e Base Familiar',
    'Comece fortalecendo o ambiente mais próximo com 15 princípios práticos de convivência e valorização familiar.',
    'Princípios essenciais para construir relacionamentos sólidos em casa.',
    'ebook',
    190
  ),
  (
    'e1000000-0000-4000-8000-000000000402',
    'd1000000-0000-4000-8000-000000000004',
    'a31d9b40-3723-4aa9-9c7d-8be4a8490b9c',
    '0feeec6f-7a65-4314-8e5b-53189fdbdd6d',
    2, 2,
    'Propósito, Fé e Superação',
    'Propósito, Fé e Superação',
    'Uma narrativa real de resiliência e renovação de sentido diante das maiores adversidades da vida.',
    'Fortaleça a esperança e a clareza de propósito.',
    'ebook',
    170
  ),
  (
    'e1000000-0000-4000-8000-000000000403',
    'd1000000-0000-4000-8000-000000000004',
    'a1186545-0d76-4250-a927-a6978c124b71',
    '0a187eda-9246-4c40-a6b1-33b152b2948e',
    3, 3,
    'Repertório e Liderança Histórica',
    'Repertório e Liderança Histórica',
    'Expanda sua visão de mundo ouvindo a trajetória de 100 figuras que transformaram os rumos da humanidade.',
    'Amplie seu repertório cultural e visão estratégica através da história.',
    'audio',
    407
  )
ON CONFLICT (trail_id, step_order) DO UPDATE SET
  work_id = EXCLUDED.work_id,
  asset_id = EXCLUDED.asset_id,
  step_number = EXCLUDED.step_number,
  title = EXCLUDED.title,
  step_title = EXCLUDED.step_title,
  objective = EXCLUDED.objective,
  description = EXCLUDED.description,
  recommended_format = EXCLUDED.recommended_format,
  estimated_minutes = EXCLUDED.estimated_minutes,
  updated_at = NOW();
