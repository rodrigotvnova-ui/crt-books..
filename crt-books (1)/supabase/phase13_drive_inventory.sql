-- ============================================================================
-- CRT BOOKS — FASE 13: INVENTÁRIO AUTOMÁTICO DO ACERVO (GOOGLE DRIVE -> SUPABASE)
-- Estrutura de inventário persistente no Supabase, totalmente separada de
-- public.works e public.assets públicos, com migração idempotente e RLS restrito.
-- ============================================================================

-- 1. TABELA DE EXECUÇÕES DO INVENTÁRIO (public.drive_inventory_runs)
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

-- 2. TABELA DE PASTAS DE ORIGEM DO INVENTÁRIO (public.drive_inventory_sources)
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

-- 3. TABELA DE ITENS DO INVENTÁRIO (public.drive_inventory_items)
-- Separada de public.works e public.assets. Todos os registros permanecem privados
-- (is_private = TRUE) e com direitos pendentes de verificação (rights_status = 'pending').
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

CREATE INDEX IF NOT EXISTS idx_drive_inv_items_source_key
  ON public.drive_inventory_items(source_folder_key);
CREATE INDEX IF NOT EXISTS idx_drive_inv_items_candidate_type
  ON public.drive_inventory_items(candidate_type);
CREATE INDEX IF NOT EXISTS idx_drive_inv_items_drive_file_id
  ON public.drive_inventory_items(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_drive_inv_items_normalized_title
  ON public.drive_inventory_items(normalized_title);
CREATE INDEX IF NOT EXISTS idx_drive_inv_items_duplicates
  ON public.drive_inventory_items(is_duplicate_id, is_possible_duplicate_title);
CREATE INDEX IF NOT EXISTS idx_drive_inv_items_has_issues
  ON public.drive_inventory_items(has_issues);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — INVENTÁRIO PRIVADO (SEM ACESSO PÚBLICO)
-- Nenhuma policy SELECT/INSERT/UPDATE/DELETE para anon ou authenticated comum.
-- Acesso exclusivo via backend administrativo (service_role + requireSupabaseAdmin).
-- ============================================================================

ALTER TABLE public.drive_inventory_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_inventory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access denied on drive_inventory_runs" ON public.drive_inventory_runs;
DROP POLICY IF EXISTS "Public access denied on drive_inventory_sources" ON public.drive_inventory_sources;
DROP POLICY IF EXISTS "Public access denied on drive_inventory_items" ON public.drive_inventory_items;

-- Garante explicitamente que usuários comuns e anônimos nunca tenham leitura pública
CREATE POLICY "Public access denied on drive_inventory_runs"
  ON public.drive_inventory_runs
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Public access denied on drive_inventory_sources"
  ON public.drive_inventory_sources
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Public access denied on drive_inventory_items"
  ON public.drive_inventory_items
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Seed inicial idempotente das 3 origens oficiais do inventário
INSERT INTO public.drive_inventory_sources (
  source_key,
  folder_id,
  folder_label,
  folder_url,
  import_mode,
  access_status
) VALUES
  (
    'audiobooks',
    '1HjOIzbvYW9LoZhq9DsIaAznspLKaec1I',
    'Audiolivros',
    'https://drive.google.com/drive/folders/1HjOIzbvYW9LoZhq9DsIaAznspLKaec1I',
    'candidate',
    'pending'
  ),
  (
    'ebooks',
    '1JOSnganIK08JXrc7k-fTecucb5bPqv1t',
    'Biblioteca de ebooks',
    'https://drive.google.com/drive/folders/1JOSnganIK08JXrc7k-fTecucb5bPqv1t',
    'candidate',
    'pending'
  ),
  (
    'additional_analysis',
    '1Ldc5MT65nU6BfS8eTZguPnWORZjaCS1X',
    'Acervo adicional para análise (sem importação automática)',
    'https://drive.google.com/drive/folders/1Ldc5MT65nU6BfS8eTZguPnWORZjaCS1X',
    'analysis_only',
    'pending'
  )
ON CONFLICT (source_key) DO UPDATE SET
  folder_id = EXCLUDED.folder_id,
  folder_label = EXCLUDED.folder_label,
  folder_url = EXCLUDED.folder_url,
  import_mode = EXCLUDED.import_mode,
  updated_at = NOW();
