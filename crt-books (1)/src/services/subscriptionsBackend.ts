import { SupabaseClient } from '@supabase/supabase-js';
import {
  SubscriptionAccessTier,
  SubscriptionPlanItem,
  SubscriptionProviderName,
  SubscriptionStatusType,
  UserSubscriptionSummary,
} from '../types/models';

const SUBSCRIPTIONS_PRIVATE_BUCKET = 'crt-subscriptions-private';
const SUBSCRIPTIONS_STATE_OBJECT = 'subscriptions_state_v14.json';

export interface StoredUserSubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  plan_code: string;
  status: SubscriptionStatusType;
  access_tier: SubscriptionAccessTier;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  provider_name: SubscriptionProviderName;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  external_order_id: string | null;
  external_product_id: string | null;
  external_offer_id: string | null;
  provider_status: string | null;
  provider_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StoredExternalSubscriptionEventRow {
  id: string;
  provider_name: string;
  external_event_id: string;
  event_type: string;
  user_id: string | null;
  subscription_id: string | null;
  external_subscription_id: string | null;
  external_order_id: string | null;
  customer_email: string | null;
  processing_status: 'received' | 'processed' | 'ignored' | 'failed';
  error_message: string | null;
  payload_json: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

interface PrivateBucketSubscriptionsPayload {
  version: number;
  updated_at: string;
  plans: SubscriptionPlanItem[];
  user_subscriptions: StoredUserSubscriptionRow[];
  external_subscription_events: StoredExternalSubscriptionEventRow[];
}

/**
 * Planos base do CRT Books (sem preços fictícios e sem links de checkout falsos).
 */
export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanItem[] = [
  {
    id: 'f1400000-0000-4000-8000-000000000001',
    code: 'free',
    name: 'Acesso Gratuito',
    description:
      'Acesso às obras gratuitas autorizadas, trilhas introdutórias e sincronização de progresso.',
    accessTier: 'free',
    billingInterval: 'none',
    isActive: true,
    checkoutEnabled: false,
    features: [
      'Acesso às obras gratuitas autorizadas',
      'Sincronização de leitura e áudio',
      'Minha Lista e progresso salvo',
    ],
  },
  {
    id: 'f1400000-0000-4000-8000-000000000002',
    code: 'premium',
    name: 'Assinatura CRT Books Premium',
    description:
      'Acesso ao catálogo completo de ebooks e audiolivros autorizados e trilhas completas quando o checkout for disponibilizado.',
    accessTier: 'premium',
    billingInterval: 'monthly',
    isActive: true,
    checkoutEnabled: false,
    features: [
      'Catálogo completo de obras autorizadas',
      'Leitor PDF e Player de Áudio com retomada',
      'Trilhas completas de desenvolvimento',
    ],
  },
];

export const FUTURE_CHECKOUT_NOTICE =
  'O checkout e a contratação de planos serão disponibilizados futuramente. Nenhuma cobrança está ativa neste momento.';

export function formatSubscriptionStatusLabel(
  status: SubscriptionStatusType,
  hasSubscriptionRecord: boolean
): string {
  if (!hasSubscriptionRecord || status === 'inactive') {
    return 'Sem assinatura ativa';
  }
  switch (status) {
    case 'active':
      return 'Assinatura ativa';
    case 'trialing':
      return 'Período de avaliação';
    case 'past_due':
      return 'Pagamento pendente';
    case 'canceled':
      return 'Assinatura cancelada';
    case 'expired':
      return 'Assinatura expirada';
    case 'refunded':
      return 'Assinatura reembolsada';
    case 'chargeback':
      return 'Assinatura suspensa';
    default:
      return 'Sem assinatura ativa';
  }
}

export function formatSubscriptionValidityLabel(
  status: SubscriptionStatusType,
  currentPeriodEnd: string | null,
  hasSubscriptionRecord: boolean
): string {
  if (!hasSubscriptionRecord || status === 'inactive') {
    return 'Sem validade ativa (Acesso Gratuito)';
  }
  if (!currentPeriodEnd) {
    return status === 'active' || status === 'trialing'
      ? 'Vigência em andamento'
      : 'Sem validade ativa';
  }
  const parsed = new Date(currentPeriodEnd);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sem validade ativa';
  }
  const formatted = parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  if (parsed.getTime() < Date.now() || status === 'expired') {
    return `Expirada em ${formatted}`;
  }
  return `Válida até ${formatted}`;
}

export function evaluateIsSubscriptionCurrentlyPremium(
  row: StoredUserSubscriptionRow | null
): boolean {
  if (!row) return false;
  if (row.access_tier !== 'premium') return false;
  if (row.status !== 'active' && row.status !== 'trialing') {
    return false;
  }
  if (row.current_period_end) {
    const endMs = new Date(row.current_period_end).getTime();
    if (!Number.isNaN(endMs) && endMs < Date.now()) {
      return false;
    }
  }
  return true;
}

async function ensurePrivateSubscriptionsBucket(
  sb: SupabaseClient
): Promise<void> {
  const { data: buckets } = await sb.storage.listBuckets();
  const exists = (buckets || []).some(
    (b) => b.name === SUBSCRIPTIONS_PRIVATE_BUCKET
  );
  if (!exists) {
    await sb.storage.createBucket(SUBSCRIPTIONS_PRIVATE_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
    });
  }
}

async function loadPrivateBucketSubscriptionsState(
  sb: SupabaseClient
): Promise<PrivateBucketSubscriptionsPayload> {
  await ensurePrivateSubscriptionsBucket(sb);
  const { data, error } = await sb.storage
    .from(SUBSCRIPTIONS_PRIVATE_BUCKET)
    .download(SUBSCRIPTIONS_STATE_OBJECT);

  if (error || !data) {
    return {
      version: 14,
      updated_at: new Date().toISOString(),
      plans: DEFAULT_SUBSCRIPTION_PLANS,
      user_subscriptions: [],
      external_subscription_events: [],
    };
  }

  try {
    const rawText = await data.text();
    const parsed = JSON.parse(rawText) as PrivateBucketSubscriptionsPayload;
    return {
      version: 14,
      updated_at: parsed.updated_at || new Date().toISOString(),
      plans:
        Array.isArray(parsed.plans) && parsed.plans.length > 0
          ? parsed.plans
          : DEFAULT_SUBSCRIPTION_PLANS,
      user_subscriptions: Array.isArray(parsed.user_subscriptions)
        ? parsed.user_subscriptions
        : [],
      external_subscription_events: Array.isArray(
        parsed.external_subscription_events
      )
        ? parsed.external_subscription_events
        : [],
    };
  } catch {
    return {
      version: 14,
      updated_at: new Date().toISOString(),
      plans: DEFAULT_SUBSCRIPTION_PLANS,
      user_subscriptions: [],
      external_subscription_events: [],
    };
  }
}

function buildUserSubscriptionSummary(
  userId: string,
  row: StoredUserSubscriptionRow | null,
  plans: SubscriptionPlanItem[],
  storageMode: 'supabase_tables' | 'supabase_private_bucket'
): UserSubscriptionSummary {
  const hasSubscriptionRecord = Boolean(row);
  const hasActivePremium = evaluateIsSubscriptionCurrentlyPremium(row);

  let effectiveStatus: SubscriptionStatusType = row?.status || 'inactive';
  if (
    row &&
    (row.status === 'active' || row.status === 'trialing') &&
    row.current_period_end
  ) {
    const endMs = new Date(row.current_period_end).getTime();
    if (!Number.isNaN(endMs) && endMs < Date.now()) {
      effectiveStatus = 'expired';
    }
  }

  const matchedPlan =
    plans.find(
      (p) =>
        (row?.plan_id && p.id === row.plan_id) ||
        (row?.plan_code &&
          p.code.toLowerCase() === row.plan_code.toLowerCase())
    ) ||
    plans.find((p) => p.code === 'free') ||
    DEFAULT_SUBSCRIPTION_PLANS[0];

  const planCode = hasSubscriptionRecord
    ? row?.plan_code || matchedPlan.code
    : 'free';

  const planName =
    hasSubscriptionRecord && effectiveStatus !== 'inactive'
      ? matchedPlan.name
      : 'Sem assinatura ativa (Acesso Gratuito)';

  const planDescription =
    hasSubscriptionRecord && effectiveStatus !== 'inactive'
      ? matchedPlan.description
      : 'Sua conta está no modo gratuito. Você pode acessar as obras gratuitas autorizadas e acompanhar seu progresso de leitura e áudio.';

  const accessTier: SubscriptionAccessTier = hasActivePremium
    ? 'premium'
    : 'free';

  return {
    userId,
    hasSubscriptionRecord,
    hasActivePremium,
    planCode,
    planName,
    planDescription,
    status: effectiveStatus,
    statusLabel: formatSubscriptionStatusLabel(
      effectiveStatus,
      hasSubscriptionRecord
    ),
    accessTier,
    currentPeriodStart: row?.current_period_start || null,
    currentPeriodEnd: row?.current_period_end || null,
    validityLabel: formatSubscriptionValidityLabel(
      effectiveStatus,
      row?.current_period_end || null,
      hasSubscriptionRecord
    ),
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    canceledAt: row?.canceled_at || null,
    checkoutEnabled: false,
    checkoutNotice: FUTURE_CHECKOUT_NOTICE,
    gateway: {
      providerName: row?.provider_name || null,
      externalCustomerId: row?.external_customer_id || null,
      externalSubscriptionId: row?.external_subscription_id || null,
      externalOrderId: row?.external_order_id || null,
      externalProductId: row?.external_product_id || null,
      externalOfferId: row?.external_offer_id || null,
      providerStatus: row?.provider_status || null,
    },
    availablePlans: plans,
    storageMode,
    updatedAt: row?.updated_at || null,
  };
}

/**
 * Consulta a assinatura EXCLUSIVAMENTE do usuário autenticado (`authenticatedUserId`).
 * Tenta primeiro as tabelas relacionais `public.subscription_plans` e `public.user_subscriptions`;
 * caso a migração SQL ainda não tenha sido aplicada no SQL Editor (`PGRST205`),
 * utiliza o estado privado seguro do Supabase (`crt-subscriptions-private`).
 * NUNCA cria assinaturas fictícias ou preços falsos.
 */
export async function getSubscriptionForAuthenticatedUser(
  sb: SupabaseClient,
  authenticatedUserId: string
): Promise<UserSubscriptionSummary> {
  const cleanUserId = String(authenticatedUserId || '').trim();
  if (!cleanUserId) {
    throw new Error('ID de usuário autenticado ausente.');
  }

  // 1. Tentar tabelas relacionais no Supabase
  const [plansRes, subRes] = await Promise.all([
    sb
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    sb
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', cleanUserId)
      .maybeSingle(),
  ]);

  const isTableMissing =
    (plansRes.error &&
      (plansRes.error.code === 'PGRST205' ||
        plansRes.error.code === '42P01' ||
        plansRes.error.message.includes('Could not find the table'))) ||
    (subRes.error &&
      (subRes.error.code === 'PGRST205' ||
        subRes.error.code === '42P01' ||
        subRes.error.message.includes('Could not find the table')));

  if (!isTableMissing && !plansRes.error && !subRes.error) {
    const dbPlans: SubscriptionPlanItem[] =
      Array.isArray(plansRes.data) && plansRes.data.length > 0
        ? plansRes.data.map((row: Record<string, unknown>) => ({
            id: String(row.id || ''),
            code: String(row.code || 'free'),
            name: String(row.name || 'Acesso Gratuito'),
            description: String(row.description || ''),
            accessTier:
              row.access_tier === 'premium' ? 'premium' : ('free' as const),
            billingInterval: (row.billing_interval as SubscriptionPlanItem['billingInterval']) || 'none',
            isActive: row.is_active !== false,
            checkoutEnabled: false,
            features: Array.isArray(row.features_json)
              ? (row.features_json as string[])
              : [],
          }))
        : DEFAULT_SUBSCRIPTION_PLANS;

    const userRow = (subRes.data as StoredUserSubscriptionRow | null) || null;
    return buildUserSubscriptionSummary(
      cleanUserId,
      userRow,
      dbPlans,
      'supabase_tables'
    );
  }

  // 2. Fallback privado no Supabase Storage (somente service_role no servidor)
  const bucketState = await loadPrivateBucketSubscriptionsState(sb);
  const foundRow =
    bucketState.user_subscriptions.find(
      (r) => r.user_id.toLowerCase() === cleanUserId.toLowerCase()
    ) || null;

  return buildUserSubscriptionSummary(
    cleanUserId,
    foundRow,
    bucketState.plans,
    'supabase_private_bucket'
  );
}

/**
 * Verifica no servidor se o usuário autenticado possui assinatura Premium ativa e dentro da validade.
 */
export async function hasActivePremiumSubscriptionServerSide(
  sb: SupabaseClient,
  authenticatedUserId: string
): Promise<boolean> {
  try {
    const summary = await getSubscriptionForAuthenticatedUser(
      sb,
      authenticatedUserId
    );
    return summary.hasActivePremium;
  } catch {
    return false;
  }
}
