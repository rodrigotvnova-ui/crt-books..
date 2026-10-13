import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSInstallGuideModal: React.FC<IOSInstallModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#0E131F] border border-white/15 p-6 space-y-5 shadow-2xl safe-bottom">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="ios-install-title"
                className="text-base sm:text-lg font-display font-bold text-white"
              >
                Instalar CRT Books no iPhone
              </h2>
              <p className="text-xs text-slate-400">
                Abra em tela cheia como aplicativo nativo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar instruções de instalação"
            className="min-w-[40px] min-h-[40px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="space-y-3 text-xs sm:text-sm text-slate-200">
          <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#07090E]/90 border border-white/[0.07]">
            <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono-tabular font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <span>Toque em Compartilhar no Safari</span>
                <Share className="w-4 h-4 text-cyan-400 inline shrink-0" />
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Localize o ícone de compartilhamento na barra inferior (ou
                superior) do navegador Safari.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#07090E]/90 border border-white/[0.07]">
            <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono-tabular font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <span>Escolha Adicionar à Tela de Início</span>
                <PlusSquare className="w-4 h-4 text-cyan-400 inline shrink-0" />
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Role a lista de ações do Safari para baixo e toque em{' '}
                <strong className="text-slate-200">
                  Adicionar à Tela de Início
                </strong>
                .
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#07090E]/90 border border-white/[0.07]">
            <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono-tabular font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-white">
                Confirme tocando em Adicionar
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                O ícone do <strong className="text-slate-200">CRT Books</strong>{' '}
                aparecerá na tela inicial do seu iPhone com abertura em modo
                standalone.
              </p>
            </div>
          </li>
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[46px] rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
        >
          Entendi
        </button>
      </div>
    </div>
  );
};

interface PWAHeaderInstallButtonProps {
  onInstalled?: () => void;
}

/**
 * Botão compacto na barra superior:
 * - Aparece quando o navegador suporta instalação direta (beforeinstallprompt)
 *   ou quando está em um iPhone/iPad (abre guia de instalação do iOS).
 * - Fica oculto quando já está instalado (standalone) ou quando o navegador não oferece suporte.
 */
export const PWAHeaderInstallButton: React.FC<PWAHeaderInstallButtonProps> = ({
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={async () => {
          const ok = await install();
          if (ok && onInstalled) {
            onInstalled();
          }
        }}
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/35 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors whitespace-nowrap cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSModal(true)}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/35 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Instalar no iPhone</span>
        </button>
        <IOSInstallGuideModal
          isOpen={showIOSModal}
          onClose={() => setShowIOSModal(false)}
        />
      </>
    );
  }

  return null;
};

interface PWAProfileInstallSectionProps {
  onNotify?: (title: string, subtitle?: string) => void;
}

/**
 * Seção de instalação PWA exibida na tela de Perfil:
 * - Se já estiver instalado em standalone: informa que o app já está instalado.
 * - Se o navegador suportar `beforeinstallprompt`: exibe botão direto de instalação.
 * - Se for iOS: exibe botão que abre o passo a passo para Safari no iPhone/iPad.
 * - Se o navegador atual não oferecer suporte automático: informa honestamente sem prometer instalação automática.
 */
export const PWAProfileInstallSection: React.FC<
  PWAProfileInstallSectionProps
> = ({ onNotify }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  return (
    <div className="rounded-2xl bg-[#0E131F]/85 border border-white/[0.08] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
          {isInstalled ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Smartphone className="w-5 h-5" />
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-display font-bold text-white">
            {isInstalled
              ? 'Aplicativo CRT Books instalado'
              : 'Aplicativo móvel (PWA)'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isInstalled
              ? 'Você já está utilizando o CRT Books em modo standalone na tela inicial.'
              : isInstallable
              ? 'Instale o CRT Books na tela inicial do seu dispositivo para acesso rápido em tela cheia.'
              : isIOS
              ? 'No iPhone ou iPad, adicione o CRT Books à Tela de Início pelo menu Compartilhar do Safari.'
              : 'Para instalar como aplicativo, abra o CRT Books diretamente no Chrome (Android) ou no Safari (iPhone) fora de janelas embutidas.'}
          </p>
        </div>
      </div>

      {isInstalled ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 shrink-0">
          <CheckCircle2 className="w-4 h-4" />
          <span>Modo standalone ativo</span>
        </span>
      ) : isInstallable ? (
        <button
          type="button"
          onClick={async () => {
            const accepted = await install();
            if (accepted && onNotify) {
              onNotify(
                'CRT Books instalado',
                'O aplicativo foi adicionado à sua tela inicial.'
              );
            }
          }}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Instalar agora</span>
        </button>
      ) : isIOS ? (
        <>
          <button
            type="button"
            onClick={() => setShowIOSModal(true)}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-xs font-semibold text-cyan-300 transition-colors shrink-0 cursor-pointer"
          >
            <Share className="w-4 h-4" />
            <span>Ver instruções para iPhone</span>
          </button>
          <IOSInstallGuideModal
            isOpen={showIOSModal}
            onClose={() => setShowIOSModal(false)}
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowIOSModal(true)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <span>Instruções para iPhone</span>
        </button>
      )}

      {!isInstallable && !isIOS && !isInstalled && (
        <IOSInstallGuideModal
          isOpen={showIOSModal}
          onClose={() => setShowIOSModal(false)}
        />
      )}
    </div>
  );
};
