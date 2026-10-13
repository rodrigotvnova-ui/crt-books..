import React, { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
  Crown,
  LogOut,
  RefreshCw,
  RotateCcw,
  Settings,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import {
  dailyTimeToMinutes,
  ONBOARDING_FORMAT_OPTIONS,
  ONBOARDING_INTERESTS,
  ONBOARDING_TIME_OPTIONS,
} from '../data/mockData';
import {
  ActiveTab,
  AuthenticatedUser,
  OnboardingPreferences,
  ProfileRecord,
  UserSubscriptionSummary,
  Work,
} from '../types/models';
import { EmptyState } from '../components/EmptyState';
import { PWAProfileInstallSection } from '../components/PWAInstallPrompt';
import { SectionHeader } from '../components/SectionHeader';

interface ProfileScreenProps {
  user: AuthenticatedUser;
  profile: ProfileRecord | null;
  works: Work[];
  subscription?: UserSubscriptionSummary | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetryLoad?: () => void;
  preferences: OnboardingPreferences;
  onSavePreferences: (
    fullName: string,
    updatedPrefs: OnboardingPreferences
  ) => Promise<void>;
  onOpenSubscription: () => void;
  onEditViaOnboarding: () => void;
  onReplaySplash: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onNotify: (title: string, subtitle?: string) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  profile,
  works,
  subscription = null,
  isLoading = false,
  errorMessage = null,
  onRetryLoad,
  preferences,
  onSavePreferences,
  onOpenSubscription,
  onEditViaOnboarding,
  onReplaySplash,
  onOpenSettings,
  onSignOut,
  onNavigateTab,
  onNotify,
}) => {
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editName, setEditName] = useState(
    profile?.full_name || user.fullName || 'Membro CRT'
  );
  const [editInterests, setEditInterests] = useState<string[]>(
    preferences.interests
  );
  const [editDailyTime, setEditDailyTime] = useState<string>(
    preferences.dailyTime
  );
  const [editFormat, setEditFormat] = useState<'Lendo' | 'Ouvindo' | 'Os dois'>(
    preferences.preferredFormat
  );
  const [saving, setSaving] = useState(false);

  const startedCount = works.filter(
    (w) =>
      w.status === 'in_progress' ||
      (w.progress > 0 && w.progress < 100) ||
      (typeof w.position === 'number' &&
        w.status !== 'completed' &&
        (w.progressType === 'listening' ? w.position > 0 : w.position > 1))
  ).length;
  const completedCount = works.filter(
    (w) => w.status === 'completed' || w.progress === 100
  ).length;
  const savedCount = works.filter((w) => w.isSaved).length;

  const displayFullName = profile?.full_name || user.fullName || 'Membro CRT';
  const displayEmail = profile?.email || user.email;
  const isConfirmedPremium = Boolean(
    subscription?.hasActivePremium === true &&
      subscription?.accessTier === 'premium' &&
      (subscription?.status === 'active' || subscription?.status === 'trialing')
  );
  const initials =
    displayFullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'CR';

  // Horas calculadas proporcionalmente ao progresso real no Supabase
  const totalMinutesLearned = works.reduce((acc, w) => {
    if (
      w.progressType === 'listening' &&
      typeof w.position === 'number' &&
      w.position > 0
    ) {
      return acc + Math.max(1, Math.round(w.position / 60));
    }
    const workMins = w.assets[0]?.durationMinutes || 35;
    if (w.progress > 0) {
      return acc + Math.max(1, Math.round((w.progress / 100) * workMins));
    }
    if (typeof w.position === 'number' && w.position > 1) {
      return acc + Math.max(1, Math.round(w.position * 1.5));
    }
    return acc;
  }, 0);
  const totalLearningHours =
    totalMinutesLearned >= 60
      ? `${(totalMinutesLearned / 60).toFixed(1).replace('.', ',')}h`
      : `${totalMinutesLearned} min`;

  const openEditModal = () => {
    setEditName(displayFullName);
    setEditInterests(preferences.interests);
    setEditDailyTime(preferences.dailyTime);
    setEditFormat(preferences.preferredFormat);
    setIsEditingModalOpen(true);
  };

  const toggleEditInterest = (option: string) => {
    if (editInterests.includes(option)) {
      setEditInterests(editInterests.filter((i) => i !== option));
      return;
    }
    if (editInterests.length >= 3) {
      onNotify(
        'Limite de 3 interesses',
        'Desmarque um interesse antes de selecionar outro.'
      );
      return;
    }
    setEditInterests([...editInterests, option]);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editInterests.length === 0) {
      onNotify('Selecione ao menos 1 interesse');
      return;
    }
    setSaving(true);
    try {
      await onSavePreferences(editName, {
        interests: editInterests,
        dailyTime: editDailyTime,
        dailyMinutes: dailyTimeToMinutes(editDailyTime),
        preferredFormat: editFormat,
        onboardingCompleted: true,
      });
      setIsEditingModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-6">
      {/* Header Identity Card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#131C2E]/95 via-[#0E131F]/95 to-[#090D16]/95 border border-white/[0.09] p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 text-center sm:text-left">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-400/25 via-sky-500/15 to-[#0B0F19] border border-cyan-400/40 flex items-center justify-center text-2xl font-display font-bold text-cyan-300 shadow-[0_0_32px_rgba(34,211,238,0.18)] shrink-0">
            {initials}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-display font-bold text-white tracking-tight">
                {displayFullName}
              </h1>
              {isConfirmedPremium && (
                <span
                  title="Assinante CRT Premium ativo"
                  aria-label="Assinante CRT Premium ativo"
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-amber-400/15 border border-amber-400/35 text-amber-300 shrink-0"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 font-mono-tabular">
              {displayEmail}
            </p>
            <p className="text-xs text-cyan-400 font-medium pt-1">
              Conta Autenticada · Preferências Sincronizadas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onOpenSubscription}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/35 text-xs font-semibold text-amber-200 transition-all cursor-pointer whitespace-nowrap"
          >
            <Crown className="w-4 h-4 text-amber-400" />
            <span>
              {isConfirmedPremium ? 'CRT Premium' : 'Conhecer o Premium'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('my-list')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-white transition-all cursor-pointer whitespace-nowrap"
          >
            <Bookmark className="w-4 h-4 text-cyan-400" />
            <span>Minha Lista ({savedCount})</span>
          </button>
        </div>
      </div>

      {/* SEÇÃO: CRT Premium / Minha Assinatura */}
      <section>
        <SectionHeader
          title="CRT Premium"
          subtitle="Plano atual, status de acesso e validade da sua assinatura"
          actionLabel={
            isConfirmedPremium ? 'Minha Assinatura' : 'Conhecer o Premium'
          }
          onAction={onOpenSubscription}
        />

        <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {isConfirmedPremium ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-400/35 text-[11px] font-mono-tabular font-semibold uppercase tracking-wider text-amber-300">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>CRT PREMIUM</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-[11px] font-mono-tabular font-semibold uppercase tracking-wider text-cyan-300">
                    <span>PLANO GRATUITO</span>
                  </span>
                )}
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-mono-tabular font-semibold ${
                    isConfirmedPremium
                      ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                      : 'bg-white/[0.05] border-white/15 text-slate-300'
                  }`}
                >
                  {subscription?.statusLabel || 'Sem assinatura ativa'}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-display font-bold text-white">
                {subscription?.planName ||
                  'Sem assinatura ativa (Acesso Gratuito)'}
              </h3>
              <p className="text-xs text-slate-400">
                Validade:{' '}
                <span className="font-mono-tabular text-slate-200">
                  {subscription?.validityLabel ||
                    'Sem validade ativa (Acesso Gratuito)'}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenSubscription}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-200 font-display font-bold text-xs uppercase tracking-wider transition-all shrink-0 cursor-pointer"
            >
              <Crown className="w-4 h-4 text-amber-400" />
              <span>
                {isConfirmedPremium ? 'Minha Assinatura' : 'Conhecer o Premium'}
              </span>
              <ChevronRight className="w-4 h-4 text-amber-300" />
            </button>
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex items-start gap-2.5 text-xs text-slate-300">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              {subscription?.checkoutNotice ||
                'O checkout e a contratação de planos serão disponibilizados futuramente. Nenhuma cobrança está ativa neste momento.'}
            </span>
          </div>
        </div>
      </section>

      {/* SEÇÃO: Minha evolução */}
      <section>
        <SectionHeader
          title="Minha evolução"
          subtitle="Seu histórico acumulado de leitura e áudio"
        />

        {isLoading && works.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2.5 rounded-2xl bg-[#0E131F]/60 border border-white/[0.06]">
            <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            <p className="text-xs sm:text-sm font-medium text-slate-300">
              Sincronizando métricas reais do seu perfil...
            </p>
          </div>
        ) : errorMessage && works.length === 0 ? (
          <EmptyState
            title="Não foi possível carregar suas estatísticas"
            description={errorMessage}
            actionLabel={onRetryLoad ? 'Tentar novamente' : undefined}
            onAction={onRetryLoad}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] p-5 space-y-1.5">
              <p className="text-xs text-slate-400">Conteúdos iniciados</p>
              <p className="text-2xl sm:text-3xl font-display font-bold text-white font-mono-tabular">
                {String(startedCount).padStart(2, '0')}
              </p>
              <p className="text-[11px] text-cyan-400">Em progresso ativo</p>
            </div>

            <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] p-5 space-y-1.5">
              <p className="text-xs text-slate-400">Conteúdos concluídos</p>
              <p className="text-2xl sm:text-3xl font-display font-bold text-white font-mono-tabular">
                {String(completedCount).padStart(2, '0')}
              </p>
              <p className="text-[11px] text-emerald-400">
                Conhecimento consolidado
              </p>
            </div>

            <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] p-5 space-y-1.5">
              <p className="text-xs text-slate-400">Horas de aprendizado</p>
              <p className="text-2xl sm:text-3xl font-display font-bold text-white font-mono-tabular">
                {totalLearningHours}
              </p>
              <p className="text-[11px] text-slate-400">
                Leitura + Áudio combinados
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SEÇÃO: Minhas preferências */}
      <section>
        <SectionHeader
          title="Minhas preferências"
          subtitle="Dados reais carregados do seu perfil"
          actionLabel="Editar preferências"
          onAction={openEditModal}
        />

        <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] divide-y divide-white/[0.06]">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-slate-300">
              <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Interesses</span>
            </div>
            <div className="text-xs sm:text-sm font-semibold text-white sm:text-right">
              {preferences.interests.length > 0
                ? preferences.interests.join(' · ')
                : 'Não definido'}
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-300">
              <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">
                Tempo diário
              </span>
            </div>
            <span className="text-xs sm:text-sm font-semibold text-white font-mono-tabular">
              {preferences.dailyTime}
            </span>
          </div>

          <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-300">
              <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">
                Formato preferido
              </span>
            </div>
            <span className="text-xs sm:text-sm font-semibold text-cyan-300">
              {preferences.preferredFormat}
            </span>
          </div>
        </div>
      </section>

      {/* SEÇÃO: Instalação do Aplicativo (PWA Android / iPhone) */}
      <section>
        <SectionHeader
          title="Aplicativo no celular"
          subtitle="Instale o CRT Books na tela inicial do Android ou iPhone"
        />
        <PWAProfileInstallSection onNotify={onNotify} />
      </section>

      {/* Ações da Conta */}
      <section className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden">
        <button
          type="button"
          onClick={onOpenSubscription}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">
                CRT Premium
              </span>
              <span className="text-[11px] text-amber-300/90">
                {isConfirmedPremium
                  ? 'Assinatura ativa · Abrir Minha Assinatura'
                  : 'Conhecer o Premium · Abrir Minha Assinatura'}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={onOpenSubscription}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">
                Minha Assinatura
              </span>
              <span className="text-[11px] text-slate-400">
                {subscription?.statusLabel || 'Sem assinatura ativa'} ·{' '}
                {subscription?.validityLabel || 'Acesso Gratuito'}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={openEditModal}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-white">
              Editar preferências
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('my-list')}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Bookmark className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-white">Minha Lista</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-white">
              Configurações
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={onReplaySplash}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <RotateCcw className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">
              Refazer Onboarding em Tela Cheia
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-4 h-4 text-rose-400" />
            <span className="text-sm font-medium text-rose-300">Sair</span>
          </div>
          <ChevronRight className="w-4 h-4 text-rose-400/60" />
        </button>
      </section>

      {/* Modal de Edição de Preferências */}
      {isEditingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0E131F] border border-white/15 p-6 sm:p-7 space-y-6 shadow-2xl safe-bottom">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-display font-bold text-white">
                  Editar preferências
                </h2>
                <p className="text-xs text-slate-400">
                  Suas escolhas são salvas diretamente no seu perfil
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-6">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={120}
                  className="w-full h-11 px-4 rounded-xl bg-[#07090E] border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Interesses (até 3) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">
                    Interesses (escolha até 3)
                  </span>
                  <span className="font-mono-tabular text-cyan-400 font-semibold">
                    {editInterests.length}/3
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ONBOARDING_INTERESTS.map((option) => {
                    const active = editInterests.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleEditInterest(option)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          active
                            ? 'bg-cyan-500/15 border-cyan-400 text-white'
                            : 'bg-[#07090E]/80 border-white/[0.08] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        <span className="truncate">{option}</span>
                        {active && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tempo Diário */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-slate-300">
                  Tempo diário
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ONBOARDING_TIME_OPTIONS.map((t) => {
                    const active = editDailyTime === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setEditDailyTime(t.value)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          active
                            ? 'bg-cyan-400 border-cyan-400 text-slate-950'
                            : 'bg-[#07090E]/80 border-white/[0.08] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Formato Preferido */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-slate-300">
                  Formato preferido
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {ONBOARDING_FORMAT_OPTIONS.map((f) => {
                    const active = editFormat === f.value;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setEditFormat(f.value)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          active
                            ? 'bg-cyan-400 border-cyan-400 text-slate-950'
                            : 'bg-[#07090E]/80 border-white/[0.08] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingModalOpen(false);
                    onEditViaOnboarding();
                  }}
                  className="text-xs text-slate-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  Abrir modo guiado (3 etapas)
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingModalOpen(false)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    {saving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
