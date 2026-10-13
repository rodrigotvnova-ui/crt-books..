import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener());
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((listener) => listener());
  });
}

/**
 * Registra o Service Worker seguro (/sw.js) do CRT Books.
 */
export function registerCrtServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('[CRT PWA] Aviso ao registrar Service Worker:', err);
      });
  });
}

/**
 * Limpa dados locais sensíveis (tokens, sessão local, estado de trilha do usuário)
 * e instrui o Service Worker a expurgar qualquer eventual requisição sensível ao sair da conta.
 */
export async function clearSensitiveLocalDataOnLogout(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // 1. Limpar chaves de autenticação e dados de usuário no localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('sb-') ||
        key.startsWith('supabase.') ||
        key.startsWith('crt_active_trail_') ||
        key.startsWith('crt_user_') ||
        key.includes('auth-token')
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignora restrições de storage
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // ignora restrições de sessionStorage
  }

  try {
    // 2. Instruir o Service Worker ativo a limpar qualquer cache sensível
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CRT_CLEAR_SENSITIVE_CACHES',
      });
    }

    // 3. Verificar caches diretamente na Cache Storage API e remover entradas não estáticas
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      for (const name of cacheNames) {
        const cache = await window.caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          if (
            req.url.includes('/api/') ||
            req.url.includes('supabase.co') ||
            /\.(pdf|epub|mp3|m4a)$/i.test(req.url)
          ) {
            await cache.delete(req);
          }
        }
      }
    }
  } catch {
    // ignora erro de Cache API em navegadores restritos
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);

  const checkStandalone = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const mediaStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true;
    return mediaStandalone || iosStandalone;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsInstalled(checkStandalone());

    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' &&
        window.navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(ua);

    setIsIOS(isIosDevice);
    setIsAndroid(isAndroidDevice);

    const syncFromGlobal = () => {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstalled(checkStandalone());
    };

    promptListeners.add(syncFromGlobal);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = () => {
      setIsInstalled(checkStandalone());
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    return () => {
      promptListeners.delete(syncFromGlobal);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, [checkStandalone]);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEvent = deferredPrompt || globalDeferredPrompt;
    if (!promptEvent) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
        setIsInstalled(true);
        promptListeners.forEach((listener) => listener());
        return true;
      }
    } catch (err) {
      console.warn('[CRT PWA] Aviso ao acionar prompt de instalação:', err);
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt || globalDeferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    install,
  };
}
