import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import {
  sendPasswordRecovery,
  signInWithEmail,
  signInWithGoogleAccount,
  signUpWithEmail,
} from '../services/database';
import { OfflineTopBanner } from '../components/OfflineExperience';
import { PWAHeaderInstallButton } from '../components/PWAInstallPrompt';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { AuthenticatedUser } from '../types/models';

interface AuthScreenProps {
  onAuthenticated: (user: AuthenticatedUser, isNewRegistration: boolean) => void;
  onNotify: (
    title: string,
    subtitle?: string,
    type?: 'info' | 'success'
  ) => void;
}

type AuthMode = 'login' | 'register' | 'recovery';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthenticated,
  onNotify,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isOnline, checkingConnection, verifyConnectionNow } =
    useNetworkStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!isOnline) {
      onNotify(
        'Você está sem conexão',
        'Conecte-se à internet para autenticar sua conta no CRT Books.'
      );
      return;
    }

    if (mode === 'recovery') {
      if (!email.trim()) {
        onNotify('Informe seu e-mail', 'Digite o e-mail da sua conta para recuperar a senha.');
        return;
      }
      setLoading(true);
      try {
        await sendPasswordRecovery(email);
        onNotify(
          'Instruções de recuperação enviadas',
          `Verifique a caixa de entrada de ${email.trim().toLowerCase()}.`,
          'success'
        );
        setMode('login');
      } catch (err) {
        onNotify(
          'Erro ao recuperar senha',
          err instanceof Error ? err.message : 'Tente novamente.'
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        onNotify('Informe seu nome', 'Precisamos do seu nome para criar seu perfil.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        onNotify('E-mail inválido', 'Informe um endereço de e-mail válido.');
        return;
      }
      if (password.length < 6) {
        onNotify(
          'Senha muito curta',
          'Escolha uma senha com pelo menos 6 caracteres.'
        );
        return;
      }

      setLoading(true);
      try {
        const user = await signUpWithEmail(fullName, email, password);
        onAuthenticated(user, true);
      } catch (err) {
        onNotify(
          'Não foi possível concluir o cadastro',
          err instanceof Error ? err.message : 'Verifique os dados informados.'
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login mode
    if (!email.trim() || !password) {
      onNotify('Preencha suas credenciais', 'Informe seu e-mail e senha para entrar.');
      return;
    }

    setLoading(true);
    try {
      const user = await signInWithEmail(email, password);
      onAuthenticated(user, false);
    } catch (err) {
      onNotify(
        'Falha na autenticação',
        err instanceof Error ? err.message : 'Verifique seu e-mail e senha.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const user = await signInWithGoogleAccount();
      onAuthenticated(user, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed-by-user')) {
        onNotify(
          'Autenticação Google cancelada ou bloqueada',
          'Você também pode criar sua conta usando Nome, E-mail e Senha.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090E] text-white flex flex-col justify-between px-4 sm:px-6 py-6 sm:py-8 safe-top safe-bottom relative overflow-x-hidden">
      <div className="mx-[-1rem] sm:mx-[-1.5rem] -mt-6 sm:-mt-8 mb-4">
        <OfflineTopBanner
          isOnline={isOnline}
          checkingConnection={checkingConnection}
          onRetryConnection={verifyConnectionNow}
        />
      </div>

      {/* Ambient Radial Light */}
      <div className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[480px] h-[280px] rounded-full bg-cyan-500/[0.08] blur-[110px]" />

      {/* Top Brand Header */}
      <div className="relative z-10 max-w-md w-full mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#121C2E] to-[#0A0E17] border border-cyan-400/35 flex items-center justify-center shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          </div>
          <span className="font-display font-extrabold text-sm tracking-[0.16em] text-white whitespace-nowrap">
            CRT BOOKS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <PWAHeaderInstallButton
            onInstalled={() =>
              onNotify(
                'CRT Books instalado',
                'O aplicativo foi adicionado à sua tela inicial.',
                'success'
              )
            }
          />
          <span className="hidden xs:inline-block text-[11px] font-mono-tabular text-cyan-400 tracking-wider uppercase">
            Leia. Ouça. Evolua.
          </span>
        </div>
      </div>

      {/* Main Auth Glass Card */}
      <div className="relative z-10 max-w-md w-full mx-auto my-auto py-6">
        <div className="rounded-3xl bg-[#0E131F]/90 backdrop-blur-xl border border-white/[0.09] p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.75)] space-y-6">
          {/* Mode Switcher Tabs (Login vs Cadastro) */}
          {mode !== 'recovery' ? (
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-[#07090E] border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`min-h-[42px] rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`min-h-[42px] rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Criar conta
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMode('login')}
              className="inline-flex items-center gap-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para o login</span>
            </button>
          )}

          {/* Title & Subtitle */}
          <div className="space-y-1.5">
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">
              {mode === 'login' && 'Acesse sua jornada'}
              {mode === 'register' && 'Comece sua evolução'}
              {mode === 'recovery' && 'Recuperar senha'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              {mode === 'login' &&
                'Entre para sincronizar sua trilha, obras salvas e progresso de leitura.'}
              {mode === 'register' &&
                'Crie sua conta para personalizar objetivos, tempo diário e formatos preferidos.'}
              {mode === 'recovery' &&
                'Enviaremos um link seguro para você redefinir sua senha de acesso.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-medium text-slate-300"
                >
                  Nome completo
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    maxLength={120}
                    className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#07090E]/90 border border-white/[0.08] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-slate-300"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  maxLength={160}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#07090E]/90 border border-white/[0.08] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </div>
            </div>

            {mode !== 'recovery' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('recovery')}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full h-12 pl-11 pr-11 rounded-2xl bg-[#07090E]/90 border border-white/[0.08] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[50px] rounded-2xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-display font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-[0_0_28px_rgba(34,211,238,0.28)] transition-all active:scale-[0.99] cursor-pointer mt-2"
            >
              <span>
                {loading
                  ? 'Processando...'
                  : mode === 'login'
                  ? 'ENTRAR NA PLATAFORMA'
                  : mode === 'register'
                  ? 'CRIAR MINHA CONTA'
                  : 'ENVIAR LINK DE RECUPERAÇÃO'}
              </span>
              {mode === 'recovery' ? (
                <KeyRound className="w-4 h-4" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
            </button>
          </form>

          {/* Divider & Google OAuth Popup Button */}
          {mode !== 'recovery' && (
            <>
              <div className="relative flex items-center justify-center py-1">
                <div className="border-t border-white/[0.08] w-full" />
                <span className="bg-[#0E131F] px-3 text-[11px] text-slate-500 uppercase tracking-wider">
                  ou
                </span>
                <div className="border-t border-white/[0.08] w-full" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-3 transition-all active:scale-[0.99] cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                  />
                </svg>
                <span>Continuar com Google</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom Note */}
      <div className="relative z-10 text-center text-xs text-slate-500">
        Você não precisa de milhares de livros. Precisa do conhecimento certo.
      </div>
    </div>
  );
};
