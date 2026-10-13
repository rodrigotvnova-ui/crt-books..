import {
  dailyTimeToMinutes,
  INTEREST_CATALOG,
  interestNameToSlug,
  interestSlugToName,
  minutesToDailyTime,
} from '../data/mockData';
import {
  clearServerAuthSessionCookie,
  getSupabaseAuthHeaders,
  isSupabaseConfigured,
  supabase,
  syncServerAuthSessionCookie,
  verifySupabaseConnectivity,
} from './supabase';
import { clearSensitiveLocalDataOnLogout } from '../hooks/usePWAInstall';
import {
  AssetSourceType,
  AuthenticatedUser,
  ContentFormat,
  FavoriteRecord,
  OnboardingPreferences,
  ProfileRecord,
  ProgressType,
  RightsStatus,
  UserInterestRecord,
  UserProgressRecord,
  UserSubscriptionSummary,
  Work,
  WorkAsset,
} from '../types/models';

const LOCAL_ACCOUNTS_KEY = 'crt_books_accounts_db_v2';
const ACTIVE_SESSION_KEY = 'crt_books_active_session_v2';
const USER_DATA_PREFIX = 'crt_books_userdata_v2_';

export type DbPreferredFormat = 'reading' | 'listening' | 'both';

/**
 * Converte a opção da interface ("Ler"/"Lendo", "Ouvir"/"Ouvindo", "Ambos"/"Os dois")
 * para EXATAMENTE os valores permitidos pelo banco: 'reading' | 'listening' | 'both'
 */
export function mapUiFormatToDb(format: string): DbPreferredFormat {
  const normalized = format.trim().toLowerCase();
  if (
    normalized === 'ler' ||
    normalized === 'lendo' ||
    normalized === 'reading'
  ) {
    return 'reading';
  }
  if (
    normalized === 'ouvir' ||
    normalized === 'ouvindo' ||
    normalized === 'listening'
  ) {
    return 'listening';
  }
  return 'both';
}

/**
 * Converte o valor salvo no banco ('reading' | 'listening' | 'both')
 * de volta para o rótulo exibido na interface ('Lendo' | 'Ouvindo' | 'Os dois')
 */
export function mapDbFormatToUi(
  dbFormat: string | null | undefined
): 'Lendo' | 'Ouvindo' | 'Os dois' {
  if (!dbFormat) return 'Os dois';
  const normalized = dbFormat.trim().toLowerCase();
  if (normalized === 'reading' || normalized === 'ler' || normalized === 'lendo') {
    return 'Lendo';
  }
  if (
    normalized === 'listening' ||
    normalized === 'ouvir' ||
    normalized === 'ouvindo'
  ) {
    return 'Ouvindo';
  }
  return 'Os dois';
}

interface LocalAccountRecord {
  uid: string;
  fullName: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface UserIsolatedStore {
  profile: ProfileRecord;
  userInterests: UserInterestRecord[];
  favorites: FavoriteRecord[];
  userProgress: UserProgressRecord[];
}

function getLocalAccounts(): LocalAccountRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAccounts(accounts: LocalAccountRecord[]): void {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore storage errors
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getLocalUserStore(
  uid: string,
  email: string,
  fullName: string
): UserIsolatedStore {
  const key = `${USER_DATA_PREFIX}${uid}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as UserIsolatedStore;
      // Garantir que ids fictícios antigos (ex: 'habitos-atomicos') não poluam contagens reais
      if (Array.isArray(parsed.favorites)) {
        parsed.favorites = parsed.favorites.filter((f) =>
          UUID_REGEX.test(String(f.work_id || ''))
        );
      } else {
        parsed.favorites = [];
      }
      if (Array.isArray(parsed.userProgress)) {
        parsed.userProgress = parsed.userProgress.filter((p) =>
          UUID_REGEX.test(String(p.work_id || ''))
        );
      } else {
        parsed.userProgress = [];
      }
      return parsed;
    }
  } catch {
    // ignore
  }

  const initialStore: UserIsolatedStore = {
    profile: {
      id: uid,
      full_name: fullName || 'Membro CRT',
      email,
      avatar_url: '',
      daily_minutes: 20,
      preferred_format: 'Os dois',
      onboarding_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    userInterests: [],
    favorites: [],
    userProgress: [],
  };

  saveLocalUserStore(uid, initialStore);
  return initialStore;
}

function saveLocalUserStore(uid: string, store: UserIsolatedStore): void {
  try {
    localStorage.setItem(`${USER_DATA_PREFIX}${uid}`, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export async function loadUserEcosystem(user: AuthenticatedUser): Promise<{
  profile: ProfileRecord;
  preferences: OnboardingPreferences;
  works: Work[];
}> {
  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);

  if (isSupabaseConfigured && supabase && user.isCloudBacked) {
    const { data: sessionData } = await supabase.auth.getSession();
    const hasActiveJwt = Boolean(sessionData?.session);

    if (hasActiveJwt) {
      // 1. Buscar ou criar profile na tabela `profiles`
      const { data: existingProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.uid)
        .maybeSingle();

      let profileData: ProfileRecord;

      if (existingProfile && !profileErr) {
        const uiFormat = mapDbFormatToUi(existingProfile.preferred_format);
        profileData = {
          id: existingProfile.id,
          full_name: existingProfile.full_name || user.fullName,
          email: user.email,
          avatar_url: existingProfile.avatar_url || user.avatarUrl || '',
          daily_minutes: Number(existingProfile.daily_minutes) || 20,
          preferred_format: uiFormat,
          onboarding_completed: Boolean(existingProfile.onboarding_completed),
          created_at: existingProfile.created_at,
          updated_at: existingProfile.updated_at,
        };
        localStore.profile = {
          ...localStore.profile,
          ...profileData,
        };
        saveLocalUserStore(user.uid, localStore);
      } else {
        const newProfilePayload = {
          id: user.uid,
          full_name: user.fullName || 'Membro CRT',
          avatar_url: user.avatarUrl || '',
          daily_minutes: localStore.profile.daily_minutes || 20,
          onboarding_completed: false,
          updated_at: new Date().toISOString(),
        };
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(newProfilePayload);
        if (upsertErr) {
          console.warn(
            '[Supabase Diagnostic] Aviso ao criar profile inicial:',
            upsertErr
          );
        }
        profileData = {
          ...newProfilePayload,
          email: user.email,
          preferred_format: 'Os dois',
        };
      }

      // 2. Buscar interesses do usuário (`user_interests` + `interests`)
      const { data: userInterestsRows } = await supabase
        .from('user_interests')
        .select('interest_id, interests(slug, name)')
        .eq('user_id', user.uid);

      const interestNames: string[] = [];
      if (userInterestsRows && userInterestsRows.length > 0) {
        for (const row of userInterestsRows as Array<{
          interest_id: string;
          interests?:
            | { slug?: string; name?: string }
            | Array<{ slug?: string; name?: string }>;
        }>) {
          const joined = Array.isArray(row.interests)
            ? row.interests[0]
            : row.interests;
          if (joined?.name) {
            interestNames.push(joined.name);
          } else if (joined?.slug) {
            interestNames.push(interestSlugToName(joined.slug));
          } else {
            interestNames.push(interestSlugToName(row.interest_id));
          }
        }
      }

      const preferences: OnboardingPreferences = {
        interests:
          interestNames.length > 0
            ? interestNames.slice(0, 3)
            : localStore.userInterests.length > 0
            ? localStore.userInterests
                .map((ui) => interestSlugToName(ui.interest_id))
                .slice(0, 3)
            : ['Disciplina e foco'],
        dailyMinutes: profileData.daily_minutes,
        dailyTime: minutesToDailyTime(profileData.daily_minutes),
        preferredFormat: profileData.preferred_format,
        onboardingCompleted: profileData.onboarding_completed,
      };

      return {
        profile: profileData,
        preferences,
        works: [],
      };
    }
  }

  // Caso o usuário tenha acabado de se cadastrar e a confirmação de e-mail do Supabase esteja ativa (sem JWT ativo ainda)
  const interestNames = localStore.userInterests.map((ui) =>
    interestSlugToName(ui.interest_id)
  );

  return {
    profile: localStore.profile,
    preferences: {
      interests:
        interestNames.length > 0
          ? interestNames.slice(0, 3)
          : ['Disciplina e foco'],
      dailyMinutes: localStore.profile.daily_minutes,
      dailyTime: minutesToDailyTime(localStore.profile.daily_minutes),
      preferredFormat: localStore.profile.preferred_format,
      onboardingCompleted: localStore.profile.onboarding_completed,
    },
    works: [],
  };
}

/**
 * ETAPA 1 DO ONBOARDING: Salvar interesses em user_interests
 */
export async function persistOnboardingStep1Interests(
  user: AuthenticatedUser,
  interestNames: string[]
): Promise<void> {
  const slugs = interestNames.slice(0, 3).map(interestNameToSlug);
  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  localStore.userInterests = slugs.map((slug) => ({
    user_id: user.uid,
    interest_id: slug,
    created_at: new Date().toISOString(),
  }));
  saveLocalUserStore(user.uid, localStore);

  if (isSupabaseConfigured && supabase && user.isCloudBacked) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return;

    const { data: dbInterests } = await supabase
      .from('interests')
      .select('id, slug')
      .in('slug', slugs);

    await supabase.from('user_interests').delete().eq('user_id', user.uid);

    if (dbInterests && dbInterests.length > 0) {
      const rows = dbInterests.map((item: { id: string }) => ({
        user_id: user.uid,
        interest_id: item.id,
      }));
      const { error } = await supabase.from('user_interests').insert(rows);
      if (error) {
        console.error('[Supabase Diagnostic] Erro ao salvar user_interests:', error);
      }
    }
  }
}

/**
 * ETAPA 2 DO ONBOARDING: Salvar daily_minutes em profiles
 */
export async function persistOnboardingStep2DailyMinutes(
  user: AuthenticatedUser,
  dailyTimeLabel: string
): Promise<void> {
  const dailyMinutes = dailyTimeToMinutes(dailyTimeLabel);
  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  localStore.profile.daily_minutes = dailyMinutes;
  localStore.profile.updated_at = new Date().toISOString();
  saveLocalUserStore(user.uid, localStore);

  if (isSupabaseConfigured && supabase && user.isCloudBacked) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return;

    const { error } = await supabase.from('profiles').upsert({
      id: user.uid,
      full_name: user.fullName,
      daily_minutes: dailyMinutes,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[Supabase Diagnostic] Erro ao salvar daily_minutes:', error);
    }
  }
}

/**
 * ETAPA 3 DO ONBOARDING: Salvar preferred_format ('reading' | 'listening' | 'both')
 * e onboarding_completed = true em profiles onde id = user.id obtido via supabase.auth.getUser()
 */
export async function persistOnboardingStep3Complete(
  user: AuthenticatedUser,
  prefs: OnboardingPreferences
): Promise<void> {
  const dbPreferredFormat = mapUiFormatToDb(prefs.preferredFormat);

  if (isSupabaseConfigured && supabase) {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      console.error(
        '[Supabase Diagnostic] Erro completo ao obter usuário autenticado em supabase.auth.getUser():',
        authError
      );
      throw new Error(
        authError?.message ||
          'Não foi possível identificar o usuário autenticado. Faça login novamente.'
      );
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        preferred_format: dbPreferredFormat,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authUser.id);

    if (updateError) {
      console.error(
        '[Supabase Diagnostic] Erro completo ao finalizar onboarding em profiles:',
        {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
          fullError: updateError,
        }
      );
      throw new Error(
        `Erro ao salvar conclusão do onboarding: ${updateError.message}`
      );
    }
  }

  const dailyMinutes = dailyTimeToMinutes(prefs.dailyTime);
  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  localStore.profile.daily_minutes = dailyMinutes;
  localStore.profile.preferred_format = prefs.preferredFormat;
  localStore.profile.onboarding_completed = true;
  localStore.profile.updated_at = new Date().toISOString();
  saveLocalUserStore(user.uid, localStore);
}

/**
 * Atualizar nome e preferências completas a partir da tela de Perfil
 */
export async function updateFullProfilePreferences(
  user: AuthenticatedUser,
  fullName: string,
  prefs: OnboardingPreferences
): Promise<void> {
  const safeName = fullName.trim().slice(0, 120) || user.fullName;
  const dailyMinutes = dailyTimeToMinutes(prefs.dailyTime);
  const dbPreferredFormat = mapUiFormatToDb(prefs.preferredFormat);

  const localStore = getLocalUserStore(user.uid, user.email, safeName);
  localStore.profile.full_name = safeName;
  localStore.profile.daily_minutes = dailyMinutes;
  localStore.profile.preferred_format = prefs.preferredFormat;
  localStore.profile.onboarding_completed = true;
  localStore.profile.updated_at = new Date().toISOString();
  saveLocalUserStore(user.uid, localStore);

  await persistOnboardingStep1Interests(user, prefs.interests);

  if (isSupabaseConfigured && supabase && user.isCloudBacked) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: safeName,
        daily_minutes: dailyMinutes,
        preferred_format: dbPreferredFormat,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authUser.id);
    if (error) {
      console.error('[Supabase Diagnostic] Erro ao atualizar profile:', error);
    }
  }
}

/**
 * FAVORITOS: Salvar ou remover em favorites
 */
export async function setWorkFavoriteInDb(
  user: AuthenticatedUser,
  workId: string,
  shouldFavorite: boolean
): Promise<void> {
  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  if (shouldFavorite) {
    if (!localStore.favorites.some((f) => f.work_id === workId)) {
      localStore.favorites.push({
        user_id: user.uid,
        work_id: workId,
        created_at: new Date().toISOString(),
      });
    }
  } else {
    localStore.favorites = localStore.favorites.filter(
      (f) => f.work_id !== workId
    );
  }
  saveLocalUserStore(user.uid, localStore);

  if (isSupabaseConfigured && supabase && user.isCloudBacked) {
    try {
      const authHeaders = await getSupabaseAuthHeaders({
        'Content-Type': 'application/json',
      });
      if (authHeaders.Authorization) {
        const favRes = await fetch('/api/favorites', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            workId,
            favorite: shouldFavorite,
          }),
        });
        if (favRes.ok) {
          return;
        }
      }
    } catch {
      // fallback para cliente autenticado do Supabase abaixo
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id;
    if (!sessionUserId) return;

    if (shouldFavorite) {
      await supabase.from('favorites').upsert({
        user_id: sessionUserId,
        work_id: workId,
      });
    } else {
      await supabase
        .from('favorites')
        .delete()
        .eq('user_id', sessionUserId)
        .eq('work_id', workId);
    }
  }
}

/**
 * PROGRESSO: Salvar ou atualizar em user_progress (sem duplicar linhas por user_id + work_id)
 */
export async function saveWorkProgressInDb(
  user: AuthenticatedUser,
  work: Work,
  progressPercent: number,
  completed: boolean,
  progressType: ProgressType = 'reading',
  exactPosition?: number,
  totalPages?: number
): Promise<void> {
  const clampedPercent = completed
    ? 100
    : Math.min(100, Math.max(0, Math.round(progressPercent)));
  const defaultAsset =
    work.assets.find(
      (a) =>
        (progressType === 'reading' && a.format === 'ebook') ||
        (progressType === 'listening' && a.format === 'audio')
    ) || work.assets[0];
  const assetId = defaultAsset?.id || 'asset-ha-ebook';
  const position =
    typeof exactPosition === 'number' && exactPosition > 0
      ? Math.floor(exactPosition)
      : work.position && work.position > 0
      ? work.position
      : completed
      ? totalPages || work.totalPages || 300
      : Math.max(1, Math.round(clampedPercent * 3));

  const nowIso = new Date().toISOString();
  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  const existingIdx = localStore.userProgress.findIndex(
    (p) => p.work_id === work.id
  );
  const record: UserProgressRecord = {
    id:
      existingIdx >= 0
        ? localStore.userProgress[existingIdx].id
        : `${user.uid}_${work.id}`,
    user_id: user.uid,
    work_id: work.id,
    asset_id: assetId,
    progress_type: progressType,
    progress_percent: clampedPercent,
    position,
    total_pages:
      totalPages ||
      work.totalPages ||
      (existingIdx >= 0
        ? localStore.userProgress[existingIdx].total_pages
        : undefined),
    completed,
    last_accessed_at: nowIso,
    created_at:
      existingIdx >= 0
        ? localStore.userProgress[existingIdx].created_at
        : nowIso,
    updated_at: nowIso,
  };

  if (existingIdx >= 0) {
    localStore.userProgress[existingIdx] = record;
  } else {
    localStore.userProgress.push(record);
  }
  saveLocalUserStore(user.uid, localStore);

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuidUser = uuidRegex.test(user.uid);
  const isUuidWork = uuidRegex.test(work.id);

  if (isUuidUser && isUuidWork) {
    try {
      const authHeaders = await getSupabaseAuthHeaders({
        'Content-Type': 'application/json',
      });
      if (authHeaders.Authorization) {
        const endpoint =
          progressType === 'listening'
            ? '/api/audio/progress'
            : '/api/reader/progress';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            workId: work.id,
            assetId: uuidRegex.test(assetId) ? assetId : null,
            progressType,
            position,
            currentPage: position,
            durationSeconds: totalPages || defaultAsset?.durationSeconds || 0,
            totalPages: totalPages || work.totalPages || 0,
            progressPercent: clampedPercent,
            completed,
          }),
        });
        if (res.ok) {
          return;
        }
      }
    } catch {
      // Fallback para cliente Supabase direto abaixo
    }
  }

  if (isSupabaseConfigured && supabase && user.isCloudBacked && isUuidWork) {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id;
    if (!sessionUserId) return;

    const { data: existingRow } = await supabase
      .from('user_progress')
      .select('id')
      .eq('user_id', sessionUserId)
      .eq('work_id', work.id)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      user_id: sessionUserId,
      work_id: work.id,
      progress_type: progressType,
      progress_percent: clampedPercent,
      position,
      completed,
      last_accessed_at: nowIso,
      updated_at: nowIso,
    };
    if (uuidRegex.test(assetId)) {
      payload.asset_id = assetId;
    }

    if (existingRow?.id) {
      await supabase
        .from('user_progress')
        .update(payload)
        .eq('id', existingRow.id);
    } else {
      await supabase.from('user_progress').insert(payload);
    }
  }
}

/**
 * FASE 6 — Salva o progresso exato de página do leitor PDF (página atual, total de páginas, percentual)
 * no Supabase (`user_progress`) e no store local do usuário.
 */
export async function saveReadingPageProgress(
  user: AuthenticatedUser,
  work: Work,
  assetId: string,
  currentPage: number,
  totalPages: number
): Promise<{
  currentPage: number;
  totalPages: number;
  progressPercent: number;
  completed: boolean;
  lastAccessedAt: string;
}> {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safePage = Math.min(Math.max(1, Math.floor(currentPage)), safeTotal);
  const completed = safePage >= safeTotal;
  const progressPercent = completed
    ? 100
    : Math.min(100, Math.max(1, Math.round((safePage / safeTotal) * 100)));
  const lastAccessedAt = new Date().toISOString();

  await saveWorkProgressInDb(
    user,
    work,
    progressPercent,
    completed,
    'reading',
    safePage,
    safeTotal
  );

  return {
    currentPage: safePage,
    totalPages: safeTotal,
    progressPercent,
    completed,
    lastAccessedAt,
  };
}

/**
 * FASE 6 — Consulta o progresso salvo de uma obra específica para o usuário no Supabase (`user_progress`)
 * ou store local de fallback.
 */
export async function fetchReadingProgressForWork(
  user: AuthenticatedUser | null | undefined,
  workId: string
): Promise<{
  currentPage: number;
  totalPages?: number;
  progressPercent: number;
  completed: boolean;
  lastAccessedAt?: string;
} | null> {
  if (!user || !workId) return null;

  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  const localProg = localStore.userProgress.find((p) => p.work_id === workId);

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(user.uid) && uuidRegex.test(workId)) {
    try {
      const authHeaders = await getSupabaseAuthHeaders();
      if (authHeaders.Authorization) {
        const res = await fetch(
          `/api/reader/progress?workId=${encodeURIComponent(workId)}`,
          {
            headers: authHeaders,
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            progress?: UserProgressRecord | null;
          };
          if (data?.ok && data.progress) {
            const dbPos = Math.max(1, Number(data.progress.position) || 1);
            const dbPct = Math.min(
              100,
              Math.max(0, Number(data.progress.progress_percent) || 0)
            );
            const dbCompleted = Boolean(data.progress.completed) || dbPct >= 100;
            return {
              currentPage: dbPos,
              totalPages: localProg?.total_pages,
              progressPercent: dbCompleted ? 100 : dbPct,
              completed: dbCompleted,
              lastAccessedAt: data.progress.last_accessed_at
                ? String(data.progress.last_accessed_at)
                : undefined,
            };
          }
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  if (localProg && Number(localProg.position) > 0) {
    return {
      currentPage: Math.max(1, Number(localProg.position) || 1),
      totalPages: localProg.total_pages,
      progressPercent: Math.min(
        100,
        Math.max(0, Number(localProg.progress_percent) || 0)
      ),
      completed: Boolean(localProg.completed),
      lastAccessedAt: localProg.last_accessed_at
        ? String(localProg.last_accessed_at)
        : undefined,
    };
  }

  return null;
}

/**
 * FASE 7F — Salva o progresso exato de audição do audiobook (tempo atual em segundos, duração total, percentual)
 * no Supabase (`user_progress` com `progress_type = 'listening'`) e no store local do usuário.
 */
export async function saveAudioListeningProgress(
  user: AuthenticatedUser,
  work: Work,
  assetId: string,
  currentTimeSeconds: number,
  durationSeconds: number,
  forceCompleted = false
): Promise<{
  position: number;
  durationSeconds: number;
  progressPercent: number;
  completed: boolean;
  lastAccessedAt: string;
}> {
  const safeDuration = Math.max(1, Math.floor(durationSeconds || 0));
  const safePosition = Math.min(
    Math.max(0, Math.floor(currentTimeSeconds || 0)),
    safeDuration
  );
  const completed =
    Boolean(forceCompleted) ||
    (safeDuration > 0 && safePosition >= safeDuration - 5);
  const progressPercent = completed
    ? 100
    : safePosition > 0
    ? Math.min(99, Math.max(1, Math.round((safePosition / safeDuration) * 100)))
    : 0;
  const lastAccessedAt = new Date().toISOString();

  await saveWorkProgressInDb(
    user,
    work,
    progressPercent,
    completed,
    'listening',
    safePosition,
    safeDuration
  );

  return {
    position: safePosition,
    durationSeconds: safeDuration,
    progressPercent,
    completed,
    lastAccessedAt,
  };
}

/**
 * FASE 7F — Consulta o progresso de áudio salvo de uma obra específica para o usuário no Supabase (`user_progress`)
 * ou store local de fallback.
 */
export async function fetchAudioProgressForWork(
  user: AuthenticatedUser | null | undefined,
  workId: string
): Promise<{
  position: number;
  progressPercent: number;
  completed: boolean;
  lastAccessedAt?: string;
} | null> {
  if (!user || !workId) return null;

  const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
  const localProg = localStore.userProgress.find((p) => p.work_id === workId);

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(user.uid) && uuidRegex.test(workId)) {
    try {
      const authHeaders = await getSupabaseAuthHeaders();
      if (authHeaders.Authorization) {
        const res = await fetch(
          `/api/audio/progress?workId=${encodeURIComponent(workId)}`,
          {
            headers: authHeaders,
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            progress?: UserProgressRecord | null;
          };
          if (data?.ok && data.progress) {
            const dbPos = Math.max(
              0,
              Math.floor(Number(data.progress.position) || 0)
            );
            const dbPct = Math.min(
              100,
              Math.max(0, Number(data.progress.progress_percent) || 0)
            );
            const dbCompleted = Boolean(data.progress.completed) || dbPct >= 100;

            // Sincroniza store local com o registro do Supabase
            const existingIdx = localStore.userProgress.findIndex(
              (p) => p.work_id === workId
            );
            if (existingIdx >= 0) {
              localStore.userProgress[existingIdx] = {
                ...localStore.userProgress[existingIdx],
                ...data.progress,
                position: dbPos,
                progress_percent: dbCompleted ? 100 : dbPct,
                completed: dbCompleted,
              };
            } else {
              localStore.userProgress.push({
                ...data.progress,
                position: dbPos,
                progress_percent: dbCompleted ? 100 : dbPct,
                completed: dbCompleted,
              });
            }
            saveLocalUserStore(user.uid, localStore);

            return {
              position: dbPos,
              progressPercent: dbCompleted ? 100 : dbPct,
              completed: dbCompleted,
              lastAccessedAt: data.progress.last_accessed_at
                ? String(data.progress.last_accessed_at)
                : undefined,
            };
          }
        }
      }
    } catch {
      // ignore and fallback to localStore
    }
  }

  if (localProg && Number(localProg.position) > 0) {
    return {
      position: Math.max(0, Math.floor(Number(localProg.position) || 0)),
      progressPercent: Math.min(
        100,
        Math.max(0, Number(localProg.progress_percent) || 0)
      ),
      completed: Boolean(localProg.completed),
      lastAccessedAt: localProg.last_accessed_at
        ? String(localProg.last_accessed_at)
        : undefined,
    };
  }

  return null;
}

/**
 * AUTENTICAÇÃO VIA SUPABASE AUTH
 */
export async function signInWithGoogleAccount(): Promise<AuthenticatedUser> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      console.error('[Supabase Diagnostic] Erro em signInWithOAuth:', error);
      throw new Error(error.message);
    }
  }
  throw new Error(
    'Para usar login com Google, habilite o provedor Google no painel do Supabase ou cadastre-se com Nome, E-mail e Senha.'
  );
}

export async function signUpWithEmail(
  fullName: string,
  email: string,
  password: string
): Promise<AuthenticatedUser> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim() || cleanEmail.split('@')[0];

  if (isSupabaseConfigured && supabase) {
    // 1. Teste de conectividade antes do signUp
    const connectivity = await verifySupabaseConnectivity();
    if (!connectivity.ok) {
      console.error(
        '[Supabase Diagnostic] Falha no teste pré-signUp:',
        connectivity.error
      );
    }

    // 2. Executa supabase.auth.signUp()
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
        },
      },
    });

    if (error) {
      console.error(
        '[Supabase Diagnostic] Erro completo retornado pelo supabase.auth.signUp():',
        {
          message: error.message,
          status: error.status,
          code: (error as { code?: string }).code,
          name: error.name,
          fullError: error,
        }
      );
      throw new Error(error.message);
    }

    if (data.user) {
      console.info(
        '[Supabase Diagnostic] supabase.auth.signUp() concluído com sucesso:',
        {
          userId: data.user.id,
          sessionActive: Boolean(data.session),
        }
      );

      const authUser: AuthenticatedUser = {
        uid: data.user.id,
        email: data.user.email || cleanEmail,
        fullName: cleanName,
        avatarUrl: '',
        emailVerified: true,
        isCloudBacked: true,
      };

      // Inicializa também o store local do usuário e, se já houver sessão ativa (JWT), grava em `profiles`
      getLocalUserStore(data.user.id, cleanEmail, cleanName);

      if (data.session) {
        await syncServerAuthSessionCookie(data.session.access_token);
        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: cleanName,
          daily_minutes: 20,
          onboarding_completed: false,
          updated_at: new Date().toISOString(),
        });
        if (profileErr) {
          console.warn(
            '[Supabase Diagnostic] Aviso ao gravar profile inicial:',
            profileErr
          );
        }
      }

      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      return authUser;
    }
  }

  // Fallback local somente se o Supabase não estiver configurado
  const accounts = getLocalAccounts();
  if (accounts.some((a) => a.email === cleanEmail)) {
    throw new Error('Este e-mail já está cadastrado. Faça login na sua conta.');
  }

  const uid = `usr_${cleanEmail.replace(/[^a-z0-9]/g, '')}_${Date.now().toString(36)}`;
  const newAccount: LocalAccountRecord = {
    uid,
    fullName: cleanName,
    email: cleanEmail,
    passwordHash: btoa(encodeURIComponent(password)),
    createdAt: new Date().toISOString(),
  };
  accounts.push(newAccount);
  saveLocalAccounts(accounts);
  getLocalUserStore(uid, cleanEmail, cleanName);

  const authUser: AuthenticatedUser = {
    uid,
    email: cleanEmail,
    fullName: cleanName,
    avatarUrl: '',
    emailVerified: true,
    isCloudBacked: false,
  };
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
  return authUser;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthenticatedUser> {
  const cleanEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    await verifySupabaseConnectivity();

    const trimmedPassword = password.trim();
    const attempts = [
      trimmedPassword,
      trimmedPassword.toLowerCase(),
      password,
    ];
    if (trimmedPassword.includes('@')) {
      attempts.push(trimmedPassword.replace(/@/g, ''));
      attempts.push(trimmedPassword.replace(/@/g, '').toLowerCase());
    }

    const seen = new Set<string>();
    let sessionUser: any = null;
    let sessionToken: string | null = null;
    let lastError: any = null;

    for (const attempt of attempts) {
      if (seen.has(attempt)) continue;
      seen.add(attempt);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: attempt,
      });

      if (!error && data.user) {
        sessionUser = data.user;
        sessionToken = data.session?.access_token || null;
        lastError = null;
        break;
      }
      lastError = error;
    }

    if (lastError && !sessionUser) {
      console.error(
        '[Supabase Diagnostic] Erro retornado pelo supabase.auth.signInWithPassword():',
        {
          message: lastError.message,
          status: lastError.status,
          code: (lastError as { code?: string }).code,
        }
      );
      if (lastError.message.toLowerCase().includes('email not confirmed')) {
        throw new Error(
          'E-mail aguardando confirmação. Confirme no link enviado ao seu e-mail ou desative "Confirm email" em Authentication > Providers > Email no Supabase.'
        );
      }
      if (
        lastError.message.toLowerCase().includes('invalid login credentials') ||
        lastError.message.toLowerCase().includes('invalid credentials')
      ) {
        throw new Error('E-mail ou senha incorretos. Verifique suas credenciais.');
      }
      throw new Error(lastError.message);
    }

    if (sessionUser) {
      if (sessionToken) {
        await syncServerAuthSessionCookie(sessionToken);
      }
      const metaName =
        (sessionUser.user_metadata?.full_name as string) ||
        cleanEmail.split('@')[0] ||
        'Membro CRT';
      const authUser: AuthenticatedUser = {
        uid: sessionUser.id,
        email: sessionUser.email || cleanEmail,
        fullName: metaName,
        avatarUrl: '',
        emailVerified: true,
        isCloudBacked: true,
      };
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      return authUser;
    }
  }

  // Fallback local somente se o Supabase não estiver configurado
  const accounts = getLocalAccounts();
  const matched = accounts.find((a) => a.email === cleanEmail);
  if (matched) {
    const expectedHash = btoa(encodeURIComponent(password));
    if (matched.passwordHash !== expectedHash) {
      throw new Error('Senha incorreta. Verifique suas credenciais.');
    }
    const localStore = getLocalUserStore(
      matched.uid,
      matched.email,
      matched.fullName
    );
    const authUser: AuthenticatedUser = {
      uid: matched.uid,
      email: matched.email,
      fullName: localStore.profile.full_name || matched.fullName,
      avatarUrl: localStore.profile.avatar_url || '',
      emailVerified: true,
      isCloudBacked: false,
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
    return authUser;
  }

  throw new Error('E-mail ou senha inválidos.');
}

export async function sendPasswordRecovery(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um endereço de e-mail válido.');
  }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin,
    });
    if (error) {
      console.error(
        '[Supabase Diagnostic] Erro em resetPasswordForEmail:',
        error
      );
      throw new Error(error.message);
    }
  }
}

export async function signOutAccount(): Promise<void> {
  await clearServerAuthSessionCookie();
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignora erro de rede ao encerrar sessão offline
    }
  }
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    localStorage.removeItem(LOCAL_ACCOUNTS_KEY);
    const keysToClean: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(USER_DATA_PREFIX)) {
        keysToClean.push(k);
      }
    }
    for (const k of keysToClean) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
  await clearSensitiveLocalDataOnLogout();
}

export function subscribeToAuthSession(
  callback: (user: AuthenticatedUser | null) => void
): () => void {
  if (isSupabaseConfigured && supabase) {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && session?.access_token) {
        await syncServerAuthSessionCookie(session.access_token);
        const u = session.user;
        const authUser: AuthenticatedUser = {
          uid: u.id,
          email: u.email || 'usuario@crtbooks.app',
          fullName:
            (u.user_metadata?.full_name as string) ||
            u.email?.split('@')[0] ||
            'Membro CRT',
          avatarUrl: (u.user_metadata?.avatar_url as string) || '',
          emailVerified: true,
          isCloudBacked: true,
        };
        callback(authUser);
      } else {
        await clearServerAuthSessionCookie();
        try {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
        } catch {
          // ignore
        }
        callback(null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && session?.access_token) {
        void syncServerAuthSessionCookie(session.access_token);
        const u = session.user;
        const authUser: AuthenticatedUser = {
          uid: u.id,
          email: u.email || 'usuario@crtbooks.app',
          fullName:
            (u.user_metadata?.full_name as string) ||
            u.email?.split('@')[0] ||
            'Membro CRT',
          avatarUrl: (u.user_metadata?.avatar_url as string) || '',
          emailVerified: true,
          isCloudBacked: true,
        };
        callback(authUser);
      } else {
        void clearServerAuthSessionCookie();
        try {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
        } catch {
          // ignore
        }
        callback(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  try {
    const savedSession = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (savedSession) {
      callback(JSON.parse(savedSession));
      return () => {};
    }
  } catch {
    // ignore
  }

  callback(null);
  return () => {};
}

interface RawSupabaseAuthorJoin {
  id: string;
  name: string;
  slug: string;
}

interface RawSupabaseAssetJoin {
  id: string;
  work_id: string;
  asset_type: string;
  source_type: string;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  checksum: string | null;
  status: string | null;
}

interface RawSupabaseCategoryJoin {
  category_id?: string;
  categories?:
    | { id?: string; name?: string; slug?: string }
    | Array<{ id?: string; name?: string; slug?: string }>
    | null;
}

interface RawSupabaseTagJoin {
  tag_id?: string;
  tags?:
    | { id?: string; name?: string; slug?: string }
    | Array<{ id?: string; name?: string; slug?: string }>
    | null;
}

interface RawSupabaseWorkRow {
  id: string;
  title: string;
  slug: string;
  author_id: string | null;
  description: string | null;
  cover_url: string | null;
  language: string | null;
  status: 'published' | 'draft' | 'archived';
  rights_status: RightsStatus;
  authors?: RawSupabaseAuthorJoin | RawSupabaseAuthorJoin[] | null;
  assets?: RawSupabaseAssetJoin[] | null;
  categories?: string[] | null;
  tags?: string[] | null;
  work_categories?: RawSupabaseCategoryJoin[] | null;
  work_tags?: RawSupabaseTagJoin[] | null;
}

const REAL_WORK_COVER_THEMES: Array<Work['coverTheme']> = [
  {
    primaryColor: '#0A192F',
    secondaryColor: '#070B14',
    accentHex: '#22D3EE',
    motif: 'rings',
  },
  {
    primaryColor: '#0F172A',
    secondaryColor: '#090D16',
    accentHex: '#38BDF8',
    motif: 'prism',
  },
  {
    primaryColor: '#1E1B2E',
    secondaryColor: '#090A10',
    accentHex: '#F59E0B',
    motif: 'arch',
  },
  {
    primaryColor: '#172554',
    secondaryColor: '#080C18',
    accentHex: '#60A5FA',
    motif: 'scroll',
  },
  {
    primaryColor: '#091E26',
    secondaryColor: '#060B10',
    accentHex: '#2DD4BF',
    motif: 'wave',
  },
  {
    primaryColor: '#111C2D',
    secondaryColor: '#070A12',
    accentHex: '#34D399',
    motif: 'compass',
  },
  {
    primaryColor: '#1E1B24',
    secondaryColor: '#09090D',
    accentHex: '#A78BFA',
    motif: 'monolith',
  },
  {
    primaryColor: '#0D1F22',
    secondaryColor: '#060A0E',
    accentHex: '#10B981',
    motif: 'nexus',
  },
];

function formatBytesLabel(
  bytes: number | null | undefined,
  format: ContentFormat = 'ebook',
  mimeType?: string | null
): string {
  const num = Number(bytes) || 0;
  const cleanMime = String(mimeType || '').toLowerCase();
  const prefix =
    format === 'audio'
      ? cleanMime.includes('m4a') || cleanMime.includes('mp4')
        ? 'M4A'
        : 'MP3'
      : cleanMime.includes('epub')
      ? 'EPUB'
      : 'PDF';

  if (num <= 0) return prefix;
  if (num >= 1024 * 1024) {
    return `${prefix} · ${(num / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${prefix} · ${Math.max(1, Math.round(num / 1024))} KB`;
}

function mapSupabaseRowToWork(
  row: RawSupabaseWorkRow,
  index: number,
  savedWorkIds: Set<string>,
  progressMap: Map<string, UserProgressRecord>
): Work {
  const joinedAuthor = Array.isArray(row.authors)
    ? row.authors[0]
    : row.authors;

  const authorName =
    row.author_id && joinedAuthor?.name
      ? joinedAuthor.name.trim()
      : 'Autor não informado';

  const rawAssets = Array.isArray(row.assets) ? row.assets : [];

  const mappedAssets: WorkAsset[] = rawAssets.map((a) => {
    const format: ContentFormat =
      a.asset_type === 'audio' ? 'audio' : 'ebook';
    const mimeType = (a.mime_type ||
      (format === 'audio' ? 'audio/mpeg' : 'application/pdf')) as WorkAsset['mimeType'];
    const durationOrPages =
      format === 'audio' && a.duration_seconds && a.duration_seconds > 0
        ? `${Math.max(1, Math.round(a.duration_seconds / 60))} min`
        : formatBytesLabel(a.file_size, format, mimeType);

    return {
      id: a.id,
      workId: a.work_id || row.id,
      format,
      mimeType,
      durationOrPages,
      durationMinutes: a.duration_seconds
        ? Math.max(1, Math.round(a.duration_seconds / 60))
        : 0,
      sourceType: (a.source_type || 'google_drive') as AssetSourceType,
      fileSize: Number(a.file_size) || 0,
      durationSeconds: Number(a.duration_seconds) || 0,
      checksum: a.checksum || undefined,
      status: (a.status || 'pending') as WorkAsset['status'],
    };
  });

  const availableFormats: ContentFormat[] = [];
  for (const asset of mappedAssets) {
    if (!availableFormats.includes(asset.format)) {
      availableFormats.push(asset.format);
    }
  }
  if (availableFormats.length === 0) {
    availableFormats.push('ebook');
  }

  const primaryAssetLabel =
    mappedAssets[0]?.durationOrPages || 'Ebook PDF';

  const userProg = progressMap.get(row.id);
  const progressPercent = userProg ? Number(userProg.progress_percent) : 0;
  const isCompleted = userProg ? Boolean(userProg.completed) : false;
  const workProgressStatus = isCompleted
    ? 'completed'
    : progressPercent > 0 || (userProg?.position ?? 0) > 0
    ? 'in_progress'
    : 'not_started';

  const theme =
    REAL_WORK_COVER_THEMES[index % REAL_WORK_COVER_THEMES.length];

  const defaultProgressType: ProgressType =
    availableFormats.includes('audio') && !availableFormats.includes('ebook')
      ? 'listening'
      : 'reading';

  const mappedCategories: string[] = [];
  if (Array.isArray(row.categories)) {
    for (const c of row.categories) {
      if (typeof c === 'string' && c.trim() && !mappedCategories.includes(c.trim())) {
        mappedCategories.push(c.trim());
      }
    }
  }
  if (Array.isArray(row.work_categories)) {
    for (const wc of row.work_categories) {
      const catObj = Array.isArray(wc.categories) ? wc.categories[0] : wc.categories;
      const catName = catObj?.name?.trim();
      if (catName && !mappedCategories.includes(catName)) {
        mappedCategories.push(catName);
      }
    }
  }

  const mappedTags: string[] = [];
  if (Array.isArray(row.tags)) {
    for (const t of row.tags) {
      if (typeof t === 'string' && t.trim() && !mappedTags.includes(t.trim())) {
        mappedTags.push(t.trim());
      }
    }
  }
  if (Array.isArray(row.work_tags)) {
    for (const wt of row.work_tags) {
      const tagObj = Array.isArray(wt.tags) ? wt.tags[0] : wt.tags;
      const tagName = tagObj?.name?.trim();
      if (tagName && !mappedTags.includes(tagName)) {
        mappedTags.push(tagName);
      }
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: authorName,
    authorId: row.author_id || undefined,
    cover: row.cover_url || undefined,
    coverTheme: theme,
    description: row.description ? row.description.trim() : '',
    language: row.language || 'pt-BR',
    dbStatus: row.status,
    rightsStatus: row.rights_status,
    categories: mappedCategories,
    tags: mappedTags,
    benefits: [],
    availableFormats,
    assets: mappedAssets,
    progress: isCompleted ? 100 : progressPercent,
    position: userProg?.position ?? 0,
    totalPages: userProg?.total_pages,
    lastAccessedAt: userProg?.last_accessed_at
      ? String(userProg.last_accessed_at)
      : undefined,
    progressType: userProg?.progress_type ?? defaultProgressType,
    duration: primaryAssetLabel,
    status: workProgressStatus,
    isSaved: savedWorkIds.has(row.id),
    relatedGoalIds: [],
  };
}

/**
 * BIBLIOTECA REAL (SUPABASE):
 * Carrega as obras reais existentes em `works` relacionando `authors`, `assets`,
 * `work_categories` e `work_tags`.
 * - Não exibe obras com `rights_status = 'blocked'`.
 * - Em acesso público estrito (`devTestMode === false`), exibe somente obras autorizadas.
 * - Preserva o ambiente privado de testes (`devTestMode === true`).
 */
export async function loadRealLibraryWorks(
  user?: AuthenticatedUser | null
): Promise<Work[]> {
  const savedWorkIds = new Set<string>();
  const progressMap = new Map<string, UserProgressRecord>();

  if (user) {
    const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
    localStore.favorites.forEach((f) => {
      if (UUID_REGEX.test(String(f.work_id || ''))) {
        savedWorkIds.add(String(f.work_id));
      }
    });
    localStore.userProgress.forEach((p) => {
      if (UUID_REGEX.test(String(p.work_id || ''))) {
        progressMap.set(String(p.work_id), p);
      }
    });

    if (UUID_REGEX.test(user.uid)) {
      try {
        const authHeaders = await getSupabaseAuthHeaders();
        if (authHeaders.Authorization) {
          const progRes = await fetch('/api/reader/progress', {
            headers: authHeaders,
          });
          if (progRes.ok) {
            const progPayload = (await progRes.json()) as {
              ok?: boolean;
              records?: UserProgressRecord[];
            };
            if (progPayload?.ok && Array.isArray(progPayload.records)) {
              for (const p of progPayload.records) {
                const workKey = String(p.work_id);
                const existingLocal = progressMap.get(workKey);
                progressMap.set(workKey, {
                  ...p,
                  total_pages: existingLocal?.total_pages,
                });
              }
            }
          }
        }
      } catch {
        // ignore and fallback
      }
    }

    if (isSupabaseConfigured && supabase && user.isCloudBacked) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        const [
          { data: favRows, error: favErr },
          { data: progRows, error: progErr },
        ] = await Promise.all([
          supabase
            .from('favorites')
            .select('work_id, created_at')
            .eq('user_id', user.uid),
          supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user.uid),
        ]);
        if (!favErr && Array.isArray(favRows)) {
          savedWorkIds.clear();
          favRows.forEach((r: { work_id: string }) => {
            if (r.work_id) savedWorkIds.add(String(r.work_id));
          });
          localStore.favorites = favRows.map(
            (r: { work_id: string; created_at?: string }) => ({
              user_id: user.uid,
              work_id: String(r.work_id),
              created_at: r.created_at || new Date().toISOString(),
            })
          );
          saveLocalUserStore(user.uid, localStore);
        }
        if (!progErr && Array.isArray(progRows)) {
          progRows.forEach((p: UserProgressRecord) => {
            const workKey = String(p.work_id);
            const existing = progressMap.get(workKey);
            progressMap.set(workKey, {
              ...p,
              total_pages: existing?.total_pages,
            });
          });
        }
      }
    }
  }

  let rawRows: RawSupabaseWorkRow[] = [];
  let isPrivateTestEnv = true;

  // 1. Consulta o endpoint GET /api/library/works
  let blockedByBackendMessage: string | null = null;
  try {
    const authHeaders = await getSupabaseAuthHeaders();
    const response = await fetch('/api/library/works', {
      headers: authHeaders,
      credentials: 'same-origin',
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      code?: string;
      message?: string;
      devTestMode?: boolean;
      works?: RawSupabaseWorkRow[];
    } | null;

    if (response.status === 401 || response.status === 403) {
      blockedByBackendMessage =
        payload?.message ||
        'Acesso restrito: sua conta não possui autorização no servidor para acessar a versão de teste do CRT Books.';
    } else if (response.ok && payload) {
      if (typeof payload.devTestMode === 'boolean') {
        isPrivateTestEnv = payload.devTestMode;
      }
      if (payload.ok && Array.isArray(payload.works)) {
        rawRows = payload.works;
      }
    }
  } catch (err) {
    console.warn(
      '[Supabase Library] Aviso ao buscar /api/library/works, tentando cliente direto:',
      err
    );
  }

  if (blockedByBackendMessage) {
    throw new Error(blockedByBackendMessage);
  }

  // 2. Fallback / complemento via cliente Supabase direto
  if (rawRows.length === 0 && isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('works')
      .select(
        `
        id,
        title,
        slug,
        author_id,
        description,
        cover_url,
        language,
        status,
        rights_status,
        created_at,
        updated_at,
        authors (
          id,
          name,
          slug
        ),
        assets (
          id,
          work_id,
          asset_type,
          source_type,
          mime_type,
          file_size,
          duration_seconds,
          checksum,
          status
        ),
        work_categories (
          category_id,
          categories (
            id,
            name,
            slug
          )
        ),
        work_tags (
          tag_id,
          tags (
            id,
            name,
            slug
          )
        )
      `
      )
      .neq('rights_status', 'blocked')
      .order('created_at', { ascending: true })
      .range(0, 1999);

    if (error) {
      throw new Error(error.message);
    }

    if (Array.isArray(data)) {
      rawRows = data as unknown as RawSupabaseWorkRow[];
    }
  }

  const approvedPublicRights = new Set([
    'approved',
    'public_domain',
    'own_content',
  ]);

  const filteredRows = rawRows.filter((row) => {
    if (row.rights_status === 'blocked') return false;
    if (!isPrivateTestEnv) {
      return (
        row.status === 'published' &&
        approvedPublicRights.has(String(row.rights_status))
      );
    }
    return true;
  });

  return filteredRows.map((row, idx) =>
    mapSupabaseRowToWork(row, idx, savedWorkIds, progressMap)
  );
}

/**
 * Carrega uma obra real específica pelo ID (para /book/:workId e /reader/:workId)
 */
export async function loadRealWorkById(
  workId: string,
  user?: AuthenticatedUser | null
): Promise<Work | null> {
  const savedWorkIds = new Set<string>();
  const progressMap = new Map<string, UserProgressRecord>();

  if (user) {
    const localStore = getLocalUserStore(user.uid, user.email, user.fullName);
    localStore.favorites.forEach((f) => savedWorkIds.add(String(f.work_id)));
    localStore.userProgress.forEach((p) =>
      progressMap.set(String(p.work_id), p)
    );

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(user.uid) && uuidRegex.test(workId)) {
      try {
        const authHeaders = await getSupabaseAuthHeaders();
        if (authHeaders.Authorization) {
          const progRes = await fetch(
            `/api/reader/progress?workId=${encodeURIComponent(workId)}`,
            {
              headers: authHeaders,
            }
          );
          if (progRes.ok) {
            const progPayload = (await progRes.json()) as {
              ok?: boolean;
              progress?: UserProgressRecord | null;
            };
            if (progPayload?.ok && progPayload.progress) {
              const existing = progressMap.get(workId);
              progressMap.set(workId, {
                ...progPayload.progress,
                total_pages: existing?.total_pages,
              });
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  try {
    const authHeaders = await getSupabaseAuthHeaders();
    const response = await fetch(
      `/api/library/works/${encodeURIComponent(workId)}`,
      {
        headers: authHeaders,
        credentials: 'same-origin',
      }
    );
    if (response.ok) {
      const payload = (await response.json()) as {
        ok?: boolean;
        work?: RawSupabaseWorkRow;
      };
      if (payload?.ok && payload.work) {
        return mapSupabaseRowToWork(payload.work, 0, savedWorkIds, progressMap);
      }
    }
  } catch (err) {
    console.warn('[Supabase Library] Aviso ao buscar obra por ID:', err);
  }

  return null;
}

/**
 * FASE 14 — Consulta a assinatura EXCLUSIVAMENTE do usuário autenticado via backend seguro (GET /api/subscription/me).
 * Somente leitura: o frontend nunca envia nem altera status, plano ou validade de assinatura.
 */
export async function fetchMySubscriptionStatus(): Promise<UserSubscriptionSummary> {
  const authHeaders = await getSupabaseAuthHeaders();
  const response = await fetch('/api/subscription/me', {
    method: 'GET',
    headers: authHeaders,
    credentials: 'same-origin',
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    subscription?: UserSubscriptionSummary;
  } | null;

  if (!response.ok || !payload?.ok || !payload.subscription) {
    throw new Error(
      payload?.message ||
        `Não foi possível consultar sua assinatura (HTTP ${response.status}).`
    );
  }

  return payload.subscription;
}

export { INTEREST_CATALOG };

