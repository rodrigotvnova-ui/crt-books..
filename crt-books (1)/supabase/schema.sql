-- ============================================================================
-- CRT BOOKS — FASE 2: ESTRUTURA DE BANCO DE DADOS E RLS
-- ============================================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  daily_minutes INTEGER DEFAULT 20,
  preferred_format TEXT DEFAULT 'Os dois',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INTERESTS
CREATE TABLE IF NOT EXISTS public.interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

INSERT INTO public.interests (slug, name) VALUES
  ('money', 'Dinheiro'),
  ('business_sales', 'Negócios e vendas'),
  ('discipline_focus', 'Disciplina e foco'),
  ('mindset', 'Mentalidade'),
  ('communication', 'Comunicação'),
  ('relationships', 'Relacionamentos'),
  ('purpose', 'Propósito'),
  ('culture_knowledge', 'Cultura e conhecimento')
ON CONFLICT (slug) DO NOTHING;

-- 3. USER_INTERESTS
CREATE TABLE IF NOT EXISTS public.user_interests (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES public.interests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, interest_id)
);

-- 4. AUTHORS
CREATE TABLE IF NOT EXISTS public.authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. WORKS (Obra intelectual independente do formato)
CREATE TABLE IF NOT EXISTS public.works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  author_id UUID REFERENCES public.authors(id) ON DELETE SET NULL,
  description TEXT,
  cover_url TEXT,
  language TEXT DEFAULT 'pt-BR',
  status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  rights_status TEXT DEFAULT 'pending' CHECK (rights_status IN ('approved', 'pending', 'blocked', 'public_domain', 'own_content')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ASSETS (Arquivo/Formato associado a uma WORK: ebook ou audio)
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('ebook', 'audio')),
  source_type TEXT NOT NULL CHECK (source_type IN ('google_drive', 'storage', 'manual')),
  drive_file_id TEXT,
  storage_path TEXT,
  mime_type TEXT,
  file_size BIGINT DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  checksum TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'processing')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. WORK_CATEGORIES
CREATE TABLE IF NOT EXISTS public.work_categories (
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (work_id, category_id)
);

-- 9. TAGS & WORK_TAGS
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.work_tags (
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (work_id, tag_id)
);

-- 10. FAVORITES
CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, work_id)
);

-- 11. USER_PROGRESS
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  progress_type TEXT NOT NULL CHECK (progress_type IN ('reading', 'listening')),
  progress_percent NUMERIC DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  position INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, work_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_tags ENABLE ROW LEVEL SECURITY;

-- Profiles: apenas o próprio usuário lê e altera seu perfil
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- User Interests: apenas o próprio usuário lê e altera seus interesses
CREATE POLICY "Users can view own interests" ON public.user_interests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interests" ON public.user_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own interests" ON public.user_interests
  FOR DELETE USING (auth.uid() = user_id);

-- Favorites: apenas o próprio usuário lê e altera seus favoritos
CREATE POLICY "Users can view own favorites" ON public.favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON public.favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON public.favorites
  FOR DELETE USING (auth.uid() = user_id);

-- User Progress: apenas o próprio usuário lê e altera seu progresso
CREATE POLICY "Users can view own progress" ON public.user_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.user_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.user_progress
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own progress" ON public.user_progress
  FOR DELETE USING (auth.uid() = user_id);

-- Catálogo público: somente obras com rights_status aprovado/domínio público/próprio
CREATE POLICY "Public catalog readable by authenticated users" ON public.works
  FOR SELECT USING (
    status = 'published' AND rights_status IN ('approved', 'public_domain', 'own_content')
  );
CREATE POLICY "Active assets readable by authenticated users" ON public.assets
  FOR SELECT USING (status = 'active');
CREATE POLICY "Interests readable by all authenticated" ON public.interests
  FOR SELECT USING (true);
CREATE POLICY "Authors readable by all authenticated" ON public.authors
  FOR SELECT USING (true);
CREATE POLICY "Categories readable by all authenticated" ON public.categories
  FOR SELECT USING (true);
CREATE POLICY "Work categories readable by all authenticated" ON public.work_categories
  FOR SELECT USING (true);
CREATE POLICY "Tags readable by all authenticated" ON public.tags
  FOR SELECT USING (true);
CREATE POLICY "Work tags readable by all authenticated" ON public.work_tags
  FOR SELECT USING (true);

-- ============================================================================
-- FASE 8B — ARQUITETURA DEFINITIVA DE MINHA TRILHA NO SUPABASE
-- Modelagem relacional escalável (1 Trilha -> N Etapas -> Obras Reais -> Progresso)
-- ============================================================================

-- 12. TRAILS
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

-- 13. TRAIL_STEPS (Suporta 3, 5, 7, 10 ou mais etapas ordenadas por step_order)
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

-- 14. USER_TRAILS
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

-- 15. USER_TRAIL_STEPS
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

ALTER TABLE public.trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trail_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trail_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trails readable by all authenticated" ON public.trails
  FOR SELECT USING (true);
CREATE POLICY "Trail steps readable by all authenticated" ON public.trail_steps
  FOR SELECT USING (true);

CREATE POLICY "Users can view own trails" ON public.user_trails
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trails" ON public.user_trails
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trails" ON public.user_trails
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own trails" ON public.user_trails
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own trail steps" ON public.user_trail_steps
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trail steps" ON public.user_trail_steps
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trail steps" ON public.user_trail_steps
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own trail steps" ON public.user_trail_steps
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- FASE 13 — INVENTÁRIO AUTOMÁTICO DO ACERVO (GOOGLE DRIVE -> SUPABASE)
-- Separado de public.works e public.assets públicos, com RLS fechado ao público.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.drive_inventory_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  total_files INTEGER NOT NULL DEFAULT 0,
  ebook_candidates INTEGER NOT NULL DEFAULT 0,
  audio_candidates INTEGER NOT NULL DEFAULT 0,
  unsupported_files INTEGER NOT NULL DEFAULT 0,
  duplicate_id_count INTEGER NOT NULL DEFAULT 0,
  duplicate_title_count INTEGER NOT NULL DEFAULT 0,
  problem_files_count INTEGER NOT NULL DEFAULT 0,
  excluded_super_bonus_count INTEGER NOT NULL DEFAULT 0,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.drive_inventory_sources (
  source_key TEXT PRIMARY KEY CHECK (source_key IN ('audiobooks', 'ebooks', 'additional_analysis')),
  folder_id TEXT UNIQUE NOT NULL,
  folder_label TEXT NOT NULL,
  folder_drive_name TEXT,
  folder_url TEXT NOT NULL,
  import_mode TEXT NOT NULL DEFAULT 'candidate' CHECK (import_mode IN ('candidate', 'analysis_only')),
  access_status TEXT NOT NULL DEFAULT 'pending' CHECK (access_status IN ('accessible', 'denied', 'not_found', 'error', 'pending')),
  http_status INTEGER,
  error_message TEXT,
  folders_scanned INTEGER NOT NULL DEFAULT 0,
  total_files INTEGER NOT NULL DEFAULT 0,
  ebook_count INTEGER NOT NULL DEFAULT 0,
  pdf_count INTEGER NOT NULL DEFAULT 0,
  epub_count INTEGER NOT NULL DEFAULT 0,
  audio_count INTEGER NOT NULL DEFAULT 0,
  mp3_count INTEGER NOT NULL DEFAULT 0,
  m4a_count INTEGER NOT NULL DEFAULT 0,
  unsupported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_id_count INTEGER NOT NULL DEFAULT 0,
  duplicate_title_count INTEGER NOT NULL DEFAULT 0,
  problem_count INTEGER NOT NULL DEFAULT 0,
  excluded_folders_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  subfolders_breakdown_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.drive_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.drive_inventory_runs(id) ON DELETE SET NULL,
  source_folder_key TEXT NOT NULL REFERENCES public.drive_inventory_sources(source_key) ON DELETE CASCADE,
  source_root_folder_id TEXT NOT NULL,
  source_folder_label TEXT NOT NULL,
  parent_folder_id TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  top_subfolder_label TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  md5_checksum TEXT,
  extracted_title TEXT NOT NULL,
  extracted_author TEXT,
  normalized_title TEXT NOT NULL,
  candidate_type TEXT NOT NULL CHECK (candidate_type IN ('ebook', 'audio', 'unsupported')),
  is_duplicate_id BOOLEAN NOT NULL DEFAULT FALSE,
  already_in_catalog_assets BOOLEAN NOT NULL DEFAULT FALSE,
  is_possible_duplicate_title BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_group_size INTEGER NOT NULL DEFAULT 1,
  has_issues BOOLEAN NOT NULL DEFAULT FALSE,
  issue_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_private BOOLEAN NOT NULL DEFAULT TRUE CHECK (is_private = TRUE),
  rights_status TEXT NOT NULL DEFAULT 'pending' CHECK (rights_status IN ('pending', 'approved', 'blocked', 'public_domain', 'own_content')),
  import_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_folder_key, drive_file_id)
);

ALTER TABLE public.drive_inventory_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_inventory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_inventory_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FASE 14 — SISTEMA DE ASSINATURAS (AGNÓSTICO DE GATEWAY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  access_tier TEXT NOT NULL DEFAULT 'free' CHECK (access_tier IN ('free', 'premium')),
  billing_interval TEXT NOT NULL DEFAULT 'none' CHECK (billing_interval IN ('none', 'monthly', 'quarterly', 'semiannual', 'annual', 'lifetime')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  checkout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  features_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  plan_code TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (
    status IN (
      'inactive',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired',
      'refunded',
      'chargeback'
    )
  ),
  access_tier TEXT NOT NULL DEFAULT 'free' CHECK (access_tier IN ('free', 'premium')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  provider_name TEXT CHECK (
    provider_name IS NULL OR
    provider_name IN ('kiwify', 'hotmart', 'kirvano', 'eduzz', 'stripe', 'manual', 'other')
  ),
  external_customer_id TEXT,
  external_subscription_id TEXT,
  external_order_id TEXT,
  external_product_id TEXT,
  external_offer_id TEXT,
  provider_status TEXT,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.external_subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  external_subscription_id TEXT,
  external_order_id TEXT,
  customer_email TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (
    processing_status IN ('received', 'processed', 'ignored', 'failed')
  ),
  error_message TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_name, external_event_id)
);

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (access_tier IN ('free', 'premium'));

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active subscription plans readable by authenticated users" ON public.subscription_plans;
CREATE POLICY "Active subscription plans readable by authenticated users"
  ON public.subscription_plans
  FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Users can view only their own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view only their own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Deny all client access to external subscription events" ON public.external_subscription_events;
CREATE POLICY "Deny all client access to external subscription events"
  ON public.external_subscription_events
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);


