-- ============================================================================
-- CRT BOOKS — FASE 14: SISTEMA DE ASSINATURAS (AGNÓSTICO DE GATEWAY)
-- Migração idempotente para planos, assinaturas de usuários e eventos externos
-- (Kiwify, Hotmart, Kirvano ou outro provedor futuro).
-- ============================================================================

-- 1. PLANOS DE ASSINATURA (Sem preços fictícios e sem links de checkout falsos)
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

INSERT INTO public.subscription_plans (
  code,
  name,
  description,
  access_tier,
  billing_interval,
  is_active,
  checkout_enabled,
  features_json
)
VALUES
  (
    'free',
    'Acesso Gratuito',
    'Acesso às obras gratuitas autorizadas, trilhas introdutórias e sincronização de progresso.',
    'free',
    'none',
    TRUE,
    FALSE,
    '["Acesso às obras gratuitas autorizadas", "Sincronização de leitura e áudio", "Minha Lista e progresso salvo"]'::jsonb
  ),
  (
    'premium',
    'Assinatura CRT Books Premium',
    'Acesso ao catálogo completo de ebooks e audiolivros autorizados e trilhas avançadas quando disponibilizado.',
    'premium',
    'monthly',
    TRUE,
    FALSE,
    '["Catálogo completo de obras autorizadas", "Leitor PDF e Player de Áudio com retomada", "Trilhas completas de desenvolvimento"]'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  access_tier = EXCLUDED.access_tier,
  checkout_enabled = FALSE,
  updated_at = NOW();

-- 2. ASSINATURAS DE USUÁRIOS (Independente de gateway: Kiwify, Hotmart, Kirvano, etc.)
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
  -- Campos agnósticos de gateway para futura integração via webhook no servidor
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

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON public.user_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
  ON public.user_subscriptions(status, current_period_end);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_external_sub
  ON public.user_subscriptions(provider_name, external_subscription_id);

-- 3. EVENTOS EXTERNOS DE ASSINATURA / WEBHOOKS (Exclusivo do servidor)
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

CREATE INDEX IF NOT EXISTS idx_external_subscription_events_user
  ON public.external_subscription_events(user_id, created_at DESC);

-- 4. COLUNA OPCIONAL DE NÍVEL DE ACESSO EM PUBLIC.WORKS (Padrão 'free', nunca sobrepõe status/rights_status)
ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (access_tier IN ('free', 'premium'));

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) — PROTEÇÃO ESTRITA
-- - Usuário autenticado visualiza SOMENTE sua própria assinatura.
-- - Frontend/cliente NUNCA pode inserir, atualizar, ativar ou excluir assinaturas.
-- - Eventos externos de gateway são visíveis apenas ao service_role no servidor.
-- ============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_subscription_events ENABLE ROW LEVEL SECURITY;

-- Planos: leitura pública/autenticada apenas de planos ativos; zero permissão de escrita pelo cliente
DROP POLICY IF EXISTS "Active subscription plans readable by authenticated users" ON public.subscription_plans;
CREATE POLICY "Active subscription plans readable by authenticated users"
  ON public.subscription_plans
  FOR SELECT
  USING (is_active = TRUE);

-- Assinaturas: cada usuário lê EXCLUSIVAMENTE sua própria linha (auth.uid() = user_id)
-- Nenhuma policy de INSERT, UPDATE ou DELETE é criada para authenticated/anon (bloqueio total de mutação pelo cliente)
DROP POLICY IF EXISTS "Users can view only their own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view only their own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Eventos externos: bloqueio total para anon e authenticated (somente service_role no servidor)
DROP POLICY IF EXISTS "Deny all client access to external subscription events" ON public.external_subscription_events;
CREATE POLICY "Deny all client access to external subscription events"
  ON public.external_subscription_events
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);
