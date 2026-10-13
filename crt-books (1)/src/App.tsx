/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PREFERENCES } from './data/mockData';
import {
  ActiveTab,
  AppScreen,
  AuthenticatedUser,
  OnboardingPreferences,
  ProfileRecord,
  UserSubscriptionSummary,
  Work,
} from './types/models';
import {
  fetchMySubscriptionStatus,
  loadRealLibraryWorks,
  loadRealWorkById,
  loadUserEcosystem,
  persistOnboardingStep1Interests,
  persistOnboardingStep2DailyMinutes,
  persistOnboardingStep3Complete,
  saveWorkProgressInDb,
  setWorkFavoriteInDb,
  signOutAccount,
  subscribeToAuthSession,
  updateFullProfilePreferences,
} from './services/database';
import { BottomNavigation } from './components/BottomNavigation';
import { BookDetails } from './components/BookDetails';
import { Toast, ToastMessage } from './components/Toast';
import { SplashScreen } from './screens/SplashScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { TrailScreen } from './screens/TrailScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { MyListScreen } from './screens/MyListScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SubscriptionScreen } from './screens/SubscriptionScreen';
import { AdminImportScreen } from './screens/AdminImportScreen';
import { AdminInventoryScreen } from './screens/AdminInventoryScreen';
import { PdfReaderScreen } from './screens/PdfReaderScreen';
import { AudioPlayerScreen } from './screens/AudioPlayerScreen';
import {
  OfflineFullScreenCard,
  OfflineTopBanner,
} from './components/OfflineExperience';
import { PWAHeaderInstallButton } from './components/PWAInstallPrompt';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { clearSensitiveLocalDataOnLogout } from './hooks/usePWAInstall';

function checkIsAdminImportRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash;
  return (
    path === '/admin/import' ||
    hash === '#/admin/import' ||
    hash === '#admin/import'
  );
}

function checkIsAdminInventoryRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash;
  return (
    path === '/admin/inventory' ||
    hash === '#/admin/inventory' ||
    hash === '#admin/inventory'
  );
}

function parseRouteBookId(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/book\/([^/]+)\/?$/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  const hashMatch = window.location.hash.match(/^#\/?book\/([^/]+)\/?$/);
  if (hashMatch?.[1]) return decodeURIComponent(hashMatch[1]);
  return null;
}

function parseRouteReaderId(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/reader\/([^/]+)\/?$/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  const hashMatch = window.location.hash.match(/^#\/?reader\/([^/]+)\/?$/);
  if (hashMatch?.[1]) return decodeURIComponent(hashMatch[1]);
  return null;
}

function parseRoutePlayerId(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/player\/([^/]+)\/?$/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  const hashMatch = window.location.hash.match(/^#\/?player\/([^/]+)\/?$/);
  if (hashMatch?.[1]) return decodeURIComponent(hashMatch[1]);
  return null;
}

function checkIsTrailRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  return (
    path === '/trilha' ||
    path.startsWith('/trilha/') ||
    path === '/trail' ||
    path.startsWith('/trail/')
  );
}

function parseRouteTrailId(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(
    /^\/(?:trilha|trail)\/([^/]+)\/?$/
  );
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  return null;
}

function checkIsSubscriptionRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash;
  return (
    path === '/assinatura' ||
    path === '/minha-assinatura' ||
    path === '/subscription' ||
    hash === '#/assinatura' ||
    hash === '#/minha-assinatura' ||
    hash === '#/subscription'
  );
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(
    checkIsAdminImportRoute
  );
  const [isAdminInventoryRoute, setIsAdminInventoryRoute] = useState<boolean>(
    checkIsAdminInventoryRoute
  );
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [splashDone, setSplashDone] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [profileRecord, setProfileRecord] = useState<ProfileRecord | null>(null);
  const [userSubscription, setUserSubscription] =
    useState<UserSubscriptionSummary | null>(null);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState<boolean>(
    checkIsSubscriptionRoute
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (checkIsSubscriptionRoute()) return 'profile';
    if (checkIsTrailRoute()) return 'trail';
    if (parseRouteBookId() || parseRouteReaderId() || parseRoutePlayerId()) {
      return 'library';
    }
    return 'home';
  });
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(() =>
    parseRouteBookId() || parseRouteReaderId() || parseRoutePlayerId()
  );
  const [readingWorkId, setReadingWorkId] = useState<string | null>(
    parseRouteReaderId
  );
  const [listeningWorkId, setListeningWorkId] = useState<string | null>(
    parseRoutePlayerId
  );
  const [openedTrailId, setOpenedTrailId] = useState<string | null>(
    parseRouteTrailId
  );
  const [returnToBookDetailsOnClose, setReturnToBookDetailsOnClose] =
    useState<boolean>(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [preferences, setPreferences] = useState<OnboardingPreferences>(
    DEFAULT_PREFERENCES
  );
  const [works, setWorks] = useState<Work[]>([]);
  const [libraryWorks, setLibraryWorks] = useState<Work[]>([]);
  const [libraryLoading, setLibraryLoading] = useState<boolean>(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const { isOnline, checkingConnection, verifyConnectionNow } =
    useNetworkStatus();

  const showToast = useCallback(
    (title: string, subtitle?: string, type: 'info' | 'success' = 'info') => {
      const id = String(Date.now());
      setToast({ id, title, subtitle, type });
    },
    []
  );

  const fetchLibraryCatalog = useCallback(
    async (userArg?: AuthenticatedUser | null) => {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        const realWorks = await loadRealLibraryWorks(userArg ?? currentUser);
        setLibraryWorks(realWorks);
        setWorks(realWorks);
      } catch (err) {
        console.error('[Supabase Library] Erro ao carregar Biblioteca real:', err);
        setLibraryError(
          err instanceof Error
            ? err.message
            : 'Erro ao consultar obras reais no Supabase.'
        );
      } finally {
        setLibraryLoading(false);
      }
    },
    [currentUser]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const hydrateFromUser = useCallback(
    async (user: AuthenticatedUser, forceOnboarding?: boolean) => {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        const [data, realLibWorks, subSummary] = await Promise.all([
          loadUserEcosystem(user),
          loadRealLibraryWorks(user).catch((err) => {
            console.error('[Supabase Library] Erro ao hidratar Biblioteca:', err);
            setLibraryError(
              err instanceof Error
                ? err.message
                : 'Erro ao consultar obras reais no Supabase.'
            );
            return [] as Work[];
          }),
          fetchMySubscriptionStatus().catch(() => null),
        ]);
        setProfileRecord(data.profile);
        setPreferences(data.preferences);
        setWorks(realLibWorks);
        setLibraryWorks(realLibWorks);
        if (subSummary) {
          setUserSubscription(subSummary);
        }

        if (!data.profile.onboarding_completed) {
          setScreen('onboarding');
        } else {
          setScreen('main');
        }
      } catch (err) {
        console.error('Failed to load user ecosystem:', err);
        setScreen(forceOnboarding ? 'onboarding' : 'main');
      } finally {
        setLibraryLoading(false);
      }
    },
    []
  );

  // Monitorar rotas (/admin/import, /book/:workId, /reader/:workId, /player/:workId, /assinatura) via URL ou hash
  useEffect(() => {
    const syncRoute = () => {
      setIsAdminRoute(checkIsAdminImportRoute());
      setIsAdminInventoryRoute(checkIsAdminInventoryRoute());
      const readerId = parseRouteReaderId();
      const playerId = parseRoutePlayerId();
      const bookId = parseRouteBookId();
      if (readerId) {
        setReadingWorkId(readerId);
        setListeningWorkId(null);
        setSelectedWorkId(readerId);
        setIsSubscriptionOpen(false);
      } else if (playerId) {
        setListeningWorkId(playerId);
        setReadingWorkId(null);
        setSelectedWorkId(playerId);
        setIsSubscriptionOpen(false);
      } else if (bookId) {
        setReadingWorkId(null);
        setListeningWorkId(null);
        setSelectedWorkId(bookId);
        setIsSubscriptionOpen(false);
      } else if (checkIsSubscriptionRoute()) {
        setReadingWorkId(null);
        setListeningWorkId(null);
        setSelectedWorkId(null);
        setActiveTab('profile');
        setIsSubscriptionOpen(true);
      } else if (checkIsTrailRoute()) {
        setReadingWorkId(null);
        setListeningWorkId(null);
        setSelectedWorkId(null);
        setIsSubscriptionOpen(false);
        setActiveTab('trail');
        setOpenedTrailId(parseRouteTrailId());
      } else {
        setReadingWorkId(null);
        setListeningWorkId(null);
        setIsSubscriptionOpen(false);
      }
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Garantir que se uma obra real de /book/:workId, /reader/:workId ou /player/:workId ainda não estiver em libraryWorks, ela seja carregada do Supabase
  useEffect(() => {
    const targetId = readingWorkId || listeningWorkId || selectedWorkId;
    if (!targetId) return;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetId)) return;

    const alreadyLoaded = libraryWorks.some((w) => w.id === targetId);
    if (!alreadyLoaded) {
      loadRealWorkById(targetId, currentUser).then((loadedWork) => {
        if (loadedWork) {
          setLibraryWorks((prev) =>
            prev.some((w) => w.id === loadedWork.id)
              ? prev
              : [...prev, loadedWork]
          );
        }
      });
    }
  }, [readingWorkId, listeningWorkId, selectedWorkId, libraryWorks, currentUser]);

  // Monitorar sessão persistente
  useEffect(() => {
    const unsubscribe = subscribeToAuthSession((user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Quando o Splash terminar e a sessão estiver pronta, roteia para Auth, Onboarding ou Home
  useEffect(() => {
    if (!splashDone || !authReady) return;

    if (!currentUser) {
      setScreen('auth');
    } else {
      hydrateFromUser(currentUser);
    }
  }, [splashDone, authReady, currentUser, hydrateFromUser]);

  const handleAuthenticated = async (
    user: AuthenticatedUser,
    isNewRegistration: boolean
  ) => {
    setCurrentUser(user);
    await hydrateFromUser(user, isNewRegistration);
    showToast(
      isNewRegistration ? 'Conta criada com sucesso' : 'Bem-vindo de volta',
      user.fullName,
      'success'
    );
  };

  const handleOnboardingStep1 = async (interests: string[]) => {
    setPreferences((prev) => ({ ...prev, interests }));
    if (currentUser) {
      await persistOnboardingStep1Interests(currentUser, interests);
    }
  };

  const handleOnboardingStep2 = async (dailyTime: string) => {
    setPreferences((prev) => ({ ...prev, dailyTime }));
    if (currentUser) {
      await persistOnboardingStep2DailyMinutes(currentUser, dailyTime);
    }
  };

  const handleCompleteOnboarding = async (newPrefs: OnboardingPreferences) => {
    if (!currentUser) {
      showToast(
        'Usuário não autenticado',
        'Faça login novamente para concluir o onboarding.',
        'info'
      );
      return;
    }

    try {
      await persistOnboardingStep3Complete(currentUser, newPrefs);
      const [refreshed, realLibWorks] = await Promise.all([
        loadUserEcosystem(currentUser),
        loadRealLibraryWorks(currentUser).catch(() => libraryWorks),
      ]);
      setProfileRecord(refreshed.profile);
      setPreferences(refreshed.preferences);
      setWorks(realLibWorks);
      setLibraryWorks(realLibWorks);

      setScreen('main');
      setActiveTab('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast(
        'Experiência personalizada salva',
        `Foco em ${newPrefs.interests.join(', ')} · ${newPrefs.dailyTime}/dia`,
        'success'
      );
    } catch (err) {
      console.error(
        '[Supabase Diagnostic] Erro ao concluir etapa final do onboarding:',
        err
      );
      showToast(
        'Não foi possível salvar sua preferência',
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro ao atualizar seu perfil no Supabase. Tente novamente.',
        'info'
      );
    }
  };

  const handleSaveProfilePreferences = async (
    fullName: string,
    updatedPrefs: OnboardingPreferences
  ) => {
    if (!currentUser) return;
    await updateFullProfilePreferences(currentUser, fullName, updatedPrefs);
    const updatedUser: AuthenticatedUser = {
      ...currentUser,
      fullName: fullName.trim() || currentUser.fullName,
    };
    setCurrentUser(updatedUser);
    const refreshed = await loadUserEcosystem(updatedUser);
    setProfileRecord(refreshed.profile);
    setPreferences(refreshed.preferences);
    showToast(
      'Preferências atualizadas',
      'Seus interesses, tempo diário e formato preferido foram salvos.',
      'success'
    );
  };

  const handleToggleSave = useCallback(
    async (work: Work) => {
      const nextSaved = !work.isSaved;
      setWorks((prev) =>
        prev.map((item) =>
          item.id === work.id ? { ...item, isSaved: nextSaved } : item
        )
      );
      setLibraryWorks((prev) =>
        prev.map((item) =>
          item.id === work.id ? { ...item, isSaved: nextSaved } : item
        )
      );
      showToast(
        nextSaved ? 'Adicionado à Minha Lista' : 'Removido da Minha Lista',
        work.title,
        nextSaved ? 'success' : 'info'
      );

      if (currentUser) {
        try {
          await setWorkFavoriteInDb(currentUser, work.id, nextSaved);
        } catch (err) {
          console.error('Error saving favorite:', err);
        }
      }
    },
    [currentUser, showToast]
  );

  const handleToggleComplete = useCallback(
    async (work: Work) => {
      const isNowCompleted = work.status !== 'completed';
      const nextProgress = isNowCompleted ? 100 : 62;
      const nextStatus = isNowCompleted ? 'completed' : 'in_progress';

      setWorks((prev) =>
        prev.map((item) =>
          item.id === work.id
            ? { ...item, status: nextStatus, progress: nextProgress }
            : item
        )
      );
      setLibraryWorks((prev) =>
        prev.map((item) =>
          item.id === work.id
            ? { ...item, status: nextStatus, progress: nextProgress }
            : item
        )
      );

      showToast(
        isNowCompleted
          ? 'Obra marcada como concluída'
          : 'Obra movida para em andamento',
        work.title,
        'success'
      );

      if (currentUser) {
        try {
          await saveWorkProgressInDb(
            currentUser,
            work,
            nextProgress,
            isNowCompleted,
            work.progressType || 'reading'
          );
        } catch (err) {
          console.error('Error updating progress:', err);
        }
      }
    },
    [currentUser, showToast]
  );

  const handleRecordAccessProgress = useCallback(
    async (work: Work, mode: 'reading' | 'listening') => {
      const nextProgress =
        work.status === 'completed'
          ? 100
          : work.progress > 0
          ? work.progress
          : 15;
      const nextStatus =
        work.status === 'completed' ? 'completed' : 'in_progress';

      setWorks((prev) =>
        prev.map((item) =>
          item.id === work.id
            ? {
                ...item,
                progress: nextProgress,
                status: nextStatus,
                progressType: mode,
              }
            : item
        )
      );
      setLibraryWorks((prev) =>
        prev.map((item) =>
          item.id === work.id
            ? {
                ...item,
                progress: nextProgress,
                status: nextStatus,
                progressType: mode,
              }
            : item
        )
      );

      if (currentUser) {
        try {
          await saveWorkProgressInDb(
            currentUser,
            work,
            nextProgress,
            work.status === 'completed',
            mode
          );
        } catch (err) {
          console.error('Error recording progress:', err);
        }
      }
    },
    [currentUser]
  );

  const handleReaderProgressUpdated = useCallback(
    (
      workId: string,
      currentPage: number,
      totalPages: number,
      progressPercent: number,
      completed: boolean
    ) => {
      const nextStatus = completed
        ? 'completed'
        : progressPercent > 0 || currentPage > 1
        ? 'in_progress'
        : 'not_started';
      const nowIso = new Date().toISOString();

      setLibraryWorks((prev) =>
        prev.map((item) =>
          item.id === workId
            ? {
                ...item,
                position: currentPage,
                totalPages,
                progress: progressPercent,
                status: nextStatus,
                progressType: 'reading',
                lastAccessedAt: nowIso,
              }
            : item
        )
      );
      setWorks((prev) =>
        prev.map((item) =>
          item.id === workId
            ? {
                ...item,
                position: currentPage,
                totalPages,
                progress: progressPercent,
                status: nextStatus,
                progressType: 'reading',
                lastAccessedAt: nowIso,
              }
            : item
        )
      );
    },
    []
  );

  const handleAudioProgressUpdated = useCallback(
    (
      workId: string,
      currentSeconds: number,
      _durationSeconds: number,
      progressPercent: number,
      completed: boolean
    ) => {
      const safePos = Math.max(0, Math.floor(currentSeconds || 0));
      const nextStatus = completed
        ? 'completed'
        : progressPercent > 0 || safePos > 0
        ? 'in_progress'
        : 'not_started';
      const nowIso = new Date().toISOString();

      setLibraryWorks((prev) =>
        prev.map((item) =>
          item.id === workId
            ? {
                ...item,
                position: safePos,
                progress: progressPercent,
                status: nextStatus,
                progressType: 'listening',
                lastAccessedAt: nowIso,
              }
            : item
        )
      );
      setWorks((prev) =>
        prev.map((item) =>
          item.id === workId
            ? {
                ...item,
                position: safePos,
                progress: progressPercent,
                status: nextStatus,
                progressType: 'listening',
                lastAccessedAt: nowIso,
              }
            : item
        )
      );
    },
    []
  );

  const handleSignOut = async () => {
    await signOutAccount();
    await clearSensitiveLocalDataOnLogout();
    setCurrentUser(null);
    setProfileRecord(null);
    setUserSubscription(null);
    setIsSubscriptionOpen(false);
    setSelectedWorkId(null);
    setReadingWorkId(null);
    setListeningWorkId(null);
    setWorks([]);
    setLibraryWorks([]);
    setActiveTab('home');
    setScreen('auth');
    showToast(
      'Sessão encerrada',
      'Faça login novamente quando desejar continuar sua evolução.',
      'info'
    );
  };

  const handleSelectWork = useCallback((work: Work) => {
    setReadingWorkId(null);
    setListeningWorkId(null);
    setIsSubscriptionOpen(false);
    setSelectedWorkId(work.id);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/book/${encodeURIComponent(work.id)}`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenReader = useCallback(
    (work: Work, returnToDetails = true) => {
      const hasRealPdfAsset = work.assets.some(
        (a) =>
          a.format === 'ebook' &&
          a.mimeType === 'application/pdf' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            a.id
          )
      );
      if (hasRealPdfAsset) {
        setReturnToBookDetailsOnClose(returnToDetails);
        setIsSubscriptionOpen(false);
        setSelectedWorkId(work.id);
        setListeningWorkId(null);
        setReadingWorkId(work.id);
        if (typeof window !== 'undefined') {
          window.history.pushState(
            {},
            '',
            `/reader/${encodeURIComponent(work.id)}`
          );
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      return false;
    },
    []
  );

  const handleOpenPlayer = useCallback(
    (work: Work, returnToDetails = true) => {
      const hasRealAudioAsset = work.assets.some(
        (a) =>
          a.format === 'audio' &&
          a.mimeType === 'audio/mpeg' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            a.id
          )
      );
      if (hasRealAudioAsset) {
        setReturnToBookDetailsOnClose(returnToDetails);
        setIsSubscriptionOpen(false);
        setSelectedWorkId(work.id);
        setReadingWorkId(null);
        setListeningWorkId(work.id);
        if (typeof window !== 'undefined') {
          window.history.pushState(
            {},
            '',
            `/player/${encodeURIComponent(work.id)}`
          );
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      return false;
    },
    []
  );

  const handleNavigateTab = useCallback(
    (tab: ActiveTab) => {
      setReadingWorkId(null);
      setListeningWorkId(null);
      setSelectedWorkId(null);
      setIsSubscriptionOpen(false);
      if (tab === 'trail') {
        setOpenedTrailId(null);
      }
      setActiveTab(tab);
      if (typeof window !== 'undefined') {
        if (tab === 'trail') {
          window.history.pushState({}, '', '/trilha');
        } else if (
          window.location.pathname.startsWith('/book/') ||
          window.location.pathname.startsWith('/reader/') ||
          window.location.pathname.startsWith('/player/') ||
          window.location.pathname.startsWith('/trilha') ||
          window.location.pathname.startsWith('/trail') ||
          window.location.pathname.startsWith('/assinatura') ||
          window.location.pathname.startsWith('/minha-assinatura') ||
          window.location.pathname.startsWith('/subscription')
        ) {
          window.history.pushState({}, '', '/');
        }
      }
      if (
        tab === 'library' ||
        tab === 'trail' ||
        tab === 'home' ||
        tab === 'explore' ||
        tab === 'my-list' ||
        tab === 'profile'
      ) {
        fetchLibraryCatalog(currentUser);
      }
      if (tab === 'profile' && currentUser) {
        fetchMySubscriptionStatus()
          .then((sub) => setUserSubscription(sub))
          .catch(() => {});
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [currentUser, fetchLibraryCatalog]
  );

  const selectedWork = useMemo(
    () =>
      libraryWorks.find((w) => w.id === selectedWorkId) ||
      works.find((w) => w.id === selectedWorkId) ||
      null,
    [libraryWorks, works, selectedWorkId]
  );

  const readingWork = useMemo(
    () =>
      libraryWorks.find((w) => w.id === readingWorkId) ||
      works.find((w) => w.id === readingWorkId) ||
      null,
    [libraryWorks, works, readingWorkId]
  );

  const listeningWork = useMemo(
    () =>
      libraryWorks.find((w) => w.id === listeningWorkId) ||
      works.find((w) => w.id === listeningWorkId) ||
      null,
    [libraryWorks, works, listeningWorkId]
  );

  const relatedWorks = useMemo(() => {
    if (!selectedWork) return [];
    const others = libraryWorks.filter((w) => w.id !== selectedWork.id);
    const matchingByClassification = others.filter(
      (w) =>
        w.categories.some((c) => selectedWork.categories.includes(c)) ||
        w.tags.some((t) => selectedWork.tags.includes(t))
    );
    if (matchingByClassification.length >= 4) {
      return matchingByClassification.slice(0, 4);
    }
    const combined = [
      ...matchingByClassification,
      ...others.filter((w) => !matchingByClassification.includes(w)),
    ];
    return combined.slice(0, 4);
  }, [libraryWorks, selectedWork]);

  if (screen === 'splash' || !splashDone) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <SplashScreen
          onComplete={() => {
            setSplashDone(true);
            if (!currentUser) {
              setScreen('auth');
            }
          }}
        />
      </>
    );
  }

  if (screen === 'auth' || !currentUser) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          onNotify={(title, subtitle, type = 'info') =>
            showToast(title, subtitle, type)
          }
        />
      </>
    );
  }

  if (isAdminInventoryRoute) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <AdminInventoryScreen
          onBackToApp={() => {
            if (window.location.hash.includes('admin/inventory')) {
              window.location.hash = '';
            }
            if (window.location.pathname.includes('/admin/inventory')) {
              window.history.pushState({}, '', '/');
            }
            setIsAdminInventoryRoute(false);
          }}
          onOpenImporter={() => {
            window.history.pushState({}, '', '/admin/import');
            setIsAdminInventoryRoute(false);
            setIsAdminRoute(true);
          }}
          onNotify={(title, subtitle, type = 'info') =>
            showToast(title, subtitle, type)
          }
        />
      </>
    );
  }

  if (isAdminRoute) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <AdminImportScreen
          onBackToApp={() => {
            if (window.location.hash.includes('admin/import')) {
              window.location.hash = '';
            }
            if (window.location.pathname.includes('/admin/import')) {
              window.history.pushState({}, '', '/');
            }
            setIsAdminRoute(false);
          }}
          onNotify={(title, subtitle, type = 'info') =>
            showToast(title, subtitle, type)
          }
        />
      </>
    );
  }

  if (screen === 'onboarding') {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <OnboardingScreen
          initialPreferences={preferences}
          onStep1Save={handleOnboardingStep1}
          onStep2Save={handleOnboardingStep2}
          onComplete={handleCompleteOnboarding}
          onNotify={(title, subtitle) => showToast(title, subtitle, 'info')}
        />
      </>
    );
  }

  if (readingWorkId) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <PdfReaderScreen
          work={readingWork}
          user={currentUser}
          isLoadingWork={!readingWork && libraryLoading}
          onProgressUpdated={handleReaderProgressUpdated}
          onBack={() => {
            const targetBookId = readingWorkId;
            setReadingWorkId(null);
            if (returnToBookDetailsOnClose) {
              setSelectedWorkId(targetBookId);
              if (typeof window !== 'undefined') {
                window.history.pushState(
                  {},
                  '',
                  `/book/${encodeURIComponent(targetBookId)}`
                );
              }
            } else {
              setSelectedWorkId(null);
              if (typeof window !== 'undefined') {
                const targetUrl =
                  activeTab === 'trail'
                    ? openedTrailId
                      ? `/trilha/${encodeURIComponent(openedTrailId)}`
                      : '/trilha'
                    : '/';
                window.history.pushState({}, '', targetUrl);
              }
            }
          }}
        />
      </>
    );
  }

  if (listeningWorkId) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <AudioPlayerScreen
          work={listeningWork}
          user={currentUser}
          isLoadingWork={!listeningWork && libraryLoading}
          onProgressUpdated={handleAudioProgressUpdated}
          onBack={() => {
            const targetBookId = listeningWorkId;
            setListeningWorkId(null);
            if (returnToBookDetailsOnClose) {
              setSelectedWorkId(targetBookId);
              if (typeof window !== 'undefined') {
                window.history.pushState(
                  {},
                  '',
                  `/book/${encodeURIComponent(targetBookId)}`
                );
              }
            } else {
              setSelectedWorkId(null);
              if (typeof window !== 'undefined') {
                const targetUrl =
                  activeTab === 'trail'
                    ? openedTrailId
                      ? `/trilha/${encodeURIComponent(openedTrailId)}`
                      : '/trilha'
                    : '/';
                window.history.pushState({}, '', targetUrl);
              }
            }
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090E] text-[#F8FAFC] flex flex-col selection:bg-cyan-500/30 overflow-x-hidden">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Top Bar Contract (Desktop & Tablet Context Navigation + Mobile Safe Area) */}
      <header className="sticky top-0 z-30 bg-[#07090E]/90 backdrop-blur-xl border-b border-white/[0.07] safe-top">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Single text element Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNavigateTab('home')}
            className="text-sm sm:text-base font-display font-extrabold tracking-[0.16em] text-white hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer"
          >
            CRT BOOKS
          </button>

          {/* Zone 2: Clean Typography Nav Links (Desktop) */}
          <nav
            aria-label="Menu superior"
            className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400"
          >
            {[
              { id: 'home', label: 'Início' },
              { id: 'explore', label: 'Explorar' },
              { id: 'trail', label: 'Minha Trilha' },
              { id: 'library', label: 'Biblioteca' },
              { id: 'my-list', label: 'Minha Lista' },
              { id: 'profile', label: 'Perfil' },
            ].map((item) => {
              const isCurrent =
                !selectedWork && activeTab === (item.id as ActiveTab);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigateTab(item.id as ActiveTab)}
                  className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
                    isCurrent
                      ? 'text-white border-cyan-400 font-semibold'
                      : 'border-transparent hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Contextual Actions (PWA Install + Profile) */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAHeaderInstallButton
              onInstalled={() =>
                showToast(
                  'CRT Books instalado',
                  'O aplicativo foi adicionado à sua tela inicial.',
                  'success'
                )
              }
            />
            <button
              type="button"
              onClick={() => handleNavigateTab('profile')}
              className="min-h-[36px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {profileRecord?.full_name?.split(' ')[0] ||
                currentUser.fullName.split(' ')[0]}
            </button>
          </div>
        </div>

        <OfflineTopBanner
          isOnline={isOnline}
          checkingConnection={checkingConnection}
          onRetryConnection={async () => {
            const online = await verifyConnectionNow();
            if (online) {
              fetchLibraryCatalog(currentUser);
              showToast('Conexão restabelecida', undefined, 'success');
            }
          }}
        />
      </header>

      {/* Main Content Container (Mobile-First, Centered & Balanced on Desktop) */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 safe-bottom-nav">
        {!isOnline && libraryWorks.length === 0 && !libraryLoading ? (
          <OfflineFullScreenCard
            checkingConnection={checkingConnection}
            onRetry={async () => {
              const online = await verifyConnectionNow();
              if (online) {
                fetchLibraryCatalog(currentUser);
              }
            }}
          />
        ) : selectedWork ? (
          <BookDetails
            work={selectedWork}
            relatedWorks={relatedWorks}
            onBack={() => {
              setSelectedWorkId(null);
              if (
                typeof window !== 'undefined' &&
                window.location.pathname.startsWith('/book/')
              ) {
                const targetUrl =
                  activeTab === 'trail'
                    ? openedTrailId
                      ? `/trilha/${encodeURIComponent(openedTrailId)}`
                      : '/trilha'
                    : '/';
                window.history.pushState({}, '', targetUrl);
              }
            }}
            onRead={async (work) => {
              const openedRealReader = handleOpenReader(work);
              if (!openedRealReader) {
                await handleRecordAccessProgress(work, 'reading');
                showToast(
                  'O leitor será ativado em uma próxima etapa.',
                  `Progresso sincronizado para "${work.title}"`,
                  'info'
                );
              }
            }}
            onListen={async (work) => {
              const openedRealPlayer = handleOpenPlayer(work);
              if (!openedRealPlayer) {
                await handleRecordAccessProgress(work, 'listening');
                showToast(
                  'O player será ativado em uma próxima etapa.',
                  `Progresso de áudio registrado para "${work.title}"`,
                  'info'
                );
              }
            }}
            onToggleSave={handleToggleSave}
            onShare={(work) =>
              showToast(
                'Link da obra copiado',
                `Compartilhe "${work.title}" com quem busca evoluir.`,
                'success'
              )
            }
            onSelectWork={handleSelectWork}
            onToggleComplete={handleToggleComplete}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                userName={profileRecord?.full_name || currentUser.fullName}
                works={libraryWorks}
                libraryWorks={libraryWorks}
                isLoading={libraryLoading}
                errorMessage={libraryError}
                onRetryLoad={() => fetchLibraryCatalog(currentUser)}
                preferences={preferences}
                onSelectWork={handleSelectWork}
                onContinueWork={async (work) => {
                  if (work.progressType === 'listening') {
                    const openedRealPlayer = handleOpenPlayer(work);
                    if (!openedRealPlayer) {
                      await handleRecordAccessProgress(work, 'listening');
                      handleSelectWork(work);
                      showToast(
                        'O player será ativado em uma próxima etapa.',
                        `Retomando ${work.title} (${work.progress}%)`,
                        'info'
                      );
                    }
                    return;
                  }

                  const openedRealReader = handleOpenReader(work);
                  if (!openedRealReader) {
                    await handleRecordAccessProgress(work, 'reading');
                    handleSelectWork(work);
                    showToast(
                      'O leitor será ativado em uma próxima etapa.',
                      `Retomando ${work.title} (${work.progress}%)`,
                      'info'
                    );
                  }
                }}
                onToggleSave={handleToggleSave}
                onNavigateTab={handleNavigateTab}
              />
            )}

            {activeTab === 'explore' && (
              <ExploreScreen
                works={libraryWorks}
                isLoading={libraryLoading}
                errorMessage={libraryError}
                onRetryLoad={() => fetchLibraryCatalog(currentUser)}
                onSelectWork={handleSelectWork}
                onToggleSave={handleToggleSave}
              />
            )}

            {activeTab === 'trail' && (
              <TrailScreen
                userId={currentUser.uid}
                preferences={preferences}
                libraryWorks={libraryWorks}
                isLoading={libraryLoading}
                openedTrailId={openedTrailId}
                onOpenTrailChange={(nextId) => {
                  setOpenedTrailId(nextId);
                  if (typeof window !== 'undefined') {
                    window.history.pushState(
                      {},
                      '',
                      nextId
                        ? `/trilha/${encodeURIComponent(nextId)}`
                        : '/trilha'
                    );
                  }
                }}
                onSelectWork={handleSelectWork}
                onStartOrContinueWork={(work) => {
                  const isAudio =
                    work.progressType === 'listening' ||
                    (work.availableFormats.includes('audio') &&
                      !work.availableFormats.includes('ebook')) ||
                    work.assets.some(
                      (a) => a.format === 'audio' || a.mimeType === 'audio/mpeg'
                    );

                  if (isAudio) {
                    const openedPlayer = handleOpenPlayer(work, false);
                    if (!openedPlayer) {
                      handleSelectWork(work);
                    }
                    return;
                  }

                  const openedReader = handleOpenReader(work, false);
                  if (!openedReader) {
                    handleSelectWork(work);
                  }
                }}
                onToggleSave={handleToggleSave}
                onNotify={(title, subtitle) =>
                  showToast(title, subtitle, 'success')
                }
              />
            )}

            {activeTab === 'library' && (
              <LibraryScreen
                works={libraryWorks}
                isLoading={libraryLoading}
                errorMessage={libraryError}
                onRetryLoad={() => fetchLibraryCatalog(currentUser)}
                onSelectWork={handleSelectWork}
                onToggleSave={handleToggleSave}
                onNavigateTab={handleNavigateTab}
              />
            )}

            {activeTab === 'my-list' && (
              <MyListScreen
                works={libraryWorks}
                isLoading={libraryLoading}
                errorMessage={libraryError}
                onRetryLoad={() => fetchLibraryCatalog(currentUser)}
                onSelectWork={handleSelectWork}
                onToggleSave={handleToggleSave}
                onNavigateTab={handleNavigateTab}
              />
            )}

            {activeTab === 'profile' &&
              (isSubscriptionOpen ? (
                <SubscriptionScreen
                  user={currentUser}
                  initialSubscription={userSubscription}
                  onSubscriptionLoaded={(sub) => setUserSubscription(sub)}
                  onBackToProfile={() => {
                    setIsSubscriptionOpen(false);
                    if (
                      typeof window !== 'undefined' &&
                      (window.location.pathname.startsWith('/assinatura') ||
                        window.location.pathname.startsWith(
                          '/minha-assinatura'
                        ) ||
                        window.location.pathname.startsWith('/subscription'))
                    ) {
                      window.history.pushState({}, '', '/');
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              ) : (
                <ProfileScreen
                  user={currentUser}
                  profile={profileRecord}
                  works={libraryWorks}
                  subscription={userSubscription}
                  isLoading={libraryLoading}
                  errorMessage={libraryError}
                  onRetryLoad={() => fetchLibraryCatalog(currentUser)}
                  preferences={preferences}
                  onSavePreferences={handleSaveProfilePreferences}
                  onOpenSubscription={() => {
                    setIsSubscriptionOpen(true);
                    if (typeof window !== 'undefined') {
                      window.history.pushState({}, '', '/assinatura');
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onEditViaOnboarding={() => setScreen('onboarding')}
                  onReplaySplash={() => setScreen('onboarding')}
                  onOpenSettings={() =>
                    showToast(
                      'Configurações em breve',
                      'Preferências avançadas de conta e notificações serão ativadas futuramente.',
                      'info'
                    )
                  }
                  onSignOut={handleSignOut}
                  onNavigateTab={handleNavigateTab}
                  onNotify={(title, subtitle) =>
                    showToast(title, subtitle, 'info')
                  }
                />
              ))}
          </>
        )}
      </main>

      {/* Fixed Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onSelectTab={handleNavigateTab}
      />
    </div>
  );
}
