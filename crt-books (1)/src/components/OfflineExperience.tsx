import React from 'react';
import { RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';

interface OfflineTopBannerProps {
  isOnline: boolean;
  checkingConnection?: boolean;
  onRetryConnection: () => void;
}

/**
 * Barra superior amigável exibida quando o dispositivo perde a conexão com a internet.
 * Informa claramente que autenticação, PDFs e audiolivros exigem conexão ativa.
 */
export const OfflineTopBanner: React.FC<OfflineTopBannerProps> = ({
  isOnline,
  checkingConnection = false,
  onRetryConnection,
}) => {
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-500/15 border-b border-amber-400/30 px-4 py-2.5 text-amber-200 z-40"
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Sem conexão com a internet.</strong> O acesso a livros,
            audiolivros e sincronização exige conexão ativa.
          </span>
        </div>

        <button
          type="button"
          disabled={checkingConnection}
          onClick={onRetryConnection}
          className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-100 font-semibold text-xs transition-colors cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${checkingConnection ? 'animate-spin' : ''}`}
          />
          <span>
            {checkingConnection ? 'Verificando...' : 'Reconectar'}
          </span>
        </button>
      </div>
    </div>
  );
};

interface OfflineFullScreenCardProps {
  title?: string;
  description?: string;
  checkingConnection?: boolean;
  onRetry: () => void;
  onBack?: () => void;
}

/**
 * Tela amigável quando não há internet e uma operação protegida (login, leitura de PDF ou streaming de áudio)
 * é solicitada. Garante que o modo offline NUNCA contorne autenticação ou direitos de acesso.
 */
export const OfflineFullScreenCard: React.FC<OfflineFullScreenCardProps> = ({
  title = 'Você está sem conexão com a internet',
  description = 'Para proteger sua conta e o acervo do CRT Books, a autenticação e a reprodução de ebooks e audiolivros exigem conexão ativa com a internet.',
  checkingConnection = false,
  onRetry,
  onBack,
}) => {
  return (
    <div className="min-h-[70dvh] w-full flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-[#0E131F]/95 border border-white/[0.09] p-6 sm:p-8 text-center space-y-5 shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center mx-auto text-amber-300">
          <WifiOff className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-display font-bold text-white">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="rounded-2xl bg-[#07090E]/90 border border-white/[0.07] p-3.5 flex items-start gap-2.5 text-left text-xs text-slate-400">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            Por segurança, PDFs, audiolivros e tokens de sessão nunca são
            armazenados no cache offline do navegador.
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              Voltar
            </button>
          )}

          <button
            type="button"
            disabled={checkingConnection}
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-6 py-2.5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-display font-bold text-xs sm:text-sm uppercase tracking-wider transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${checkingConnection ? 'animate-spin' : ''}`}
            />
            <span>
              {checkingConnection
                ? 'Verificando conexão...'
                : 'Tentar novamente'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
