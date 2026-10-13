import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { fetchMySubscriptionStatus } from '../services/database';
import { AuthenticatedUser, UserSubscriptionSummary } from '../types/models';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';

interface SubscriptionScreenProps {
  user: AuthenticatedUser;
  initialSubscription?: UserSubscriptionSummary | null;
  onSubscriptionLoaded?: (sub: UserSubscriptionSummary) => void;
  onBackToProfile: () => void;
}

function getProviderDisplayName(provider: string | null | undefined): string {
  if (!provider) return 'Nenhum provedor vinculado';
  switch (provider.toLowerCase()) {
    case 'kiwify':
      return 'Kiwify';
    case 'hotmart':
      return 'Hotmart';
    case 'kirvano':
      return 'Kirvano';
    case 'eduzz':
      return 'Eduzz';
    case 'stripe':
      return 'Stripe';
    case 'manual':
      return 'Liberação administrativa no servidor';
    default:
      return provider;
  }
}

export const SubscriptionScreen: React.FC<SubscriptionScreenProps> = ({
  user,
  initialSubscription = null,
  onSubscriptionLoaded,
  onBackToProfile,
}) => {
  const [subscription, setSubscription] =
    useState<UserSubscriptionSummary | null>(initialSubscription);
  const [isLoading, setIsLoading] = useState<boolean>(!initialSubscription);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await fetchMySubscriptionStatus();
      setSubscription(result);
      if (onSubscriptionLoaded) {
        onSubscriptionLoaded(result);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar os dados da sua assinatura.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [onSubscriptionLoaded]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription, user.uid]);

  const isPremiumActive = Boolean(
    subscription?.hasActivePremium === true &&
      subscription?.accessTier === 'premium' &&
      (subscription?.status === 'active' || subscription?.status === 'trialing')
  );
  const statusCode = subscription?.status || 'inactive';

  const statusBadgeClasses = isPremiumActive
    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
    : statusCode === 'past_due' || statusCode === 'expired'
    ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
    : 'bg-slate-500/15 border-white/15 text-slate-300';

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-6">
      {/* Top Bar de Retorno ao Perfil */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Minha Assinatura
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Consulte seu plano atual, status de acesso e validade da conta
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToProfile}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-[#0E131F] hover:bg-[#151D2E] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Perfil</span>
        </button>
      </div>

      {isLoading && !subscription ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl bg-[#0E131F]/60 border border-white/[0.06]">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
          <p className="text-sm font-medium text-slate-200">
            Consultando situação da sua assinatura no servidor...
          </p>
        </div>
      ) : errorMessage && !subscription ? (
        <EmptyState
          title="Não foi possível consultar sua assinatura"
          description={errorMessage}
          actionLabel="Tentar novamente"
          onAction={loadSubscription}
        />
      ) : subscription ? (
        <>
          {/* Cartão Principal: Plano Atual, Status e Validade */}
          <section className="rounded-3xl bg-gradient-to-br from-[#131C2E]/95 via-[#0E131F]/95 to-[#090D16]/95 border border-white/[0.09] p-6 sm:p-8 space-y-6 shadow-[0_24px_55px_rgba(0,0,0,0.65)]">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/[0.07] pb-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/35 text-[11px] font-mono-tabular font-semibold uppercase tracking-wider text-amber-300">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {isPremiumActive ? 'CRT Premium' : 'Conhecer o Premium'}
                    </span>
                  </span>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono-tabular font-semibold uppercase tracking-wider ${statusBadgeClasses}`}
                  >
                    {isPremiumActive ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    <span>{subscription.statusLabel}</span>
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                  {subscription.planName}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                  {subscription.planDescription}
                </p>
              </div>

              <button
                type="button"
                onClick={loadSubscription}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors self-start shrink-0 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`}
                />
                <span>Atualizar status</span>
              </button>
            </div>

            {/* Grade Resumo: Plano | Status | Validade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="rounded-2xl bg-[#07090E]/85 border border-white/[0.07] p-4 space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-mono-tabular">
                  Nível de acesso
                </p>
                <p className="text-base sm:text-lg font-display font-bold text-white">
                  {subscription.accessTier === 'premium'
                    ? 'Premium Ativo'
                    : 'Acesso Gratuito'}
                </p>
                <p className="text-xs text-slate-400">
                  {subscription.hasSubscriptionRecord
                    ? `Código do plano: ${subscription.planCode}`
                    : 'Nenhum plano pago vinculado'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#07090E]/85 border border-white/[0.07] p-4 space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-mono-tabular">
                  Status da assinatura
                </p>
                <p className="text-base sm:text-lg font-display font-bold text-white">
                  {subscription.statusLabel}
                </p>
                <p className="text-xs text-slate-400">
                  {subscription.hasSubscriptionRecord
                    ? `Estado registrado: ${subscription.status}`
                    : 'Conta sem assinatura ativa'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#07090E]/85 border border-white/[0.07] p-4 space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-mono-tabular flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Validade</span>
                </p>
                <p className="text-base sm:text-lg font-display font-bold text-white font-mono-tabular">
                  {subscription.validityLabel}
                </p>
                <p className="text-xs text-slate-400">
                  {subscription.currentPeriodEnd
                    ? 'Renovação/vigência controlada pelo servidor'
                    : 'Sem cobrança ou vencimento programado'}
                </p>
              </div>
            </div>

            {/* Aviso Oficial de Checkout Futuro (Sem preços ou links fictícios) */}
            <div className="rounded-2xl bg-cyan-500/10 border border-cyan-400/30 p-4 sm:p-5 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-display font-bold text-white">
                  Contratação e checkout serão disponibilizados futuramente
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {subscription.checkoutNotice} Quando a integração com a
                  plataforma de pagamento (Kiwify, Hotmart, Kirvano ou outro
                  provedor) for ativada, sua assinatura será sincronizada
                  automaticamente pelo servidor usando o e-mail da sua conta (
                  <span className="font-mono-tabular text-cyan-300">
                    {user.email}
                  </span>
                  ).
                </p>
              </div>
            </div>
          </section>

          {/* Planos Estruturados na Plataforma (Somente informativos, sem preços/links fictícios) */}
          <section>
            <SectionHeader
              title="Modalidades de acesso no CRT Books"
              subtitle="Estrutura de níveis configurada no servidor (sem checkout ativo no momento)"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {subscription.availablePlans.map((plan) => {
                const isCurrentPlan =
                  (plan.code === 'free' && !subscription.hasActivePremium) ||
                  (plan.code === subscription.planCode &&
                    subscription.hasActivePremium);

                return (
                  <div
                    key={plan.code}
                    className={`rounded-2xl p-5 sm:p-6 border flex flex-col justify-between gap-4 ${
                      isCurrentPlan
                        ? 'bg-[#111A2E]/90 border-cyan-400/45 shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                        : 'bg-[#0E131F]/80 border-white/[0.08]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-base sm:text-lg font-display font-bold text-white">
                          {plan.accessTier === 'premium' && (
                            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                          )}
                          <span>{plan.name}</span>
                        </span>
                        {isCurrentPlan ? (
                          <span className="px-2.5 py-0.5 rounded-lg bg-cyan-400/20 border border-cyan-400/40 text-[11px] font-semibold text-cyan-300">
                            Modalidade atual
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-400/35 text-[11px] font-medium text-amber-300">
                            Conhecer o Premium
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        {plan.description}
                      </p>

                      {plan.features.length > 0 && (
                        <ul className="space-y-2 pt-1">
                          {plan.features.map((feat) => (
                            <li
                              key={feat}
                              className="flex items-center gap-2 text-xs text-slate-300"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                      <span>Status de contratação:</span>
                      <span className="font-mono-tabular text-slate-300">
                        {isCurrentPlan
                          ? 'Vinculado à sua conta'
                          : 'Checkout disponível futuramente'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Informações de Integração e Segurança da Assinatura */}
          <section>
            <SectionHeader
              title="Dados de vinculação e segurança"
              subtitle="Proteção server-side e compatibilidade com provedores externos"
            />

            <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] divide-y divide-white/[0.06]">
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">
                    Titular da assinatura
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-mono-tabular text-white">
                  {user.email}
                </span>
              </div>

              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-slate-300">
                  <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">
                    Provedor de pagamento externo
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-medium text-slate-300">
                  {getProviderDisplayName(subscription.gateway.providerName)}
                </span>
              </div>

              {subscription.gateway.externalSubscriptionId && (
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-slate-300">
                    <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-medium">
                      Referência externa da assinatura
                    </span>
                  </div>
                  <span className="text-xs font-mono-tabular text-slate-300">
                    {subscription.gateway.externalSubscriptionId}
                  </span>
                </div>
              )}

              <div className="p-4 sm:p-5 flex items-start gap-3 text-xs text-slate-400 leading-relaxed">
                <Lock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  A validação de assinatura, permissões de leitura/áudio e
                  direitos autorais das obras é executada exclusivamente no
                  servidor. Alterações de plano ocorrem apenas por confirmação
                  autenticada no backend.
                </span>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};
