import { createClient, SupabaseClient } from '@supabase/supabase-js';

function extractCleanSupabaseUrl(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (typeof src !== 'string' || !src.trim()) continue;

    // 1. Extrai diretamente URLs https://<project-ref>.supabase.co mesmo se coladas com NEXT_PUBLIC_SUPABASE_URL=...
    const directMatch = src.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
    if (directMatch && directMatch[0]) {
      return directMatch[0].trim();
    }

    // 2. Caso tenha sido colado sem protocolo (ex: suoqsjjgtvenwwskpmqd.supabase.co)
    const domainMatch = src.match(/([a-z0-9-]+\.supabase\.co)/i);
    if (domainMatch && domainMatch[1]) {
      return `https://${domainMatch[1].trim()}`;
    }

    // 3. Caso seja uma URL HTTP/HTTPS customizada limpa
    const cleaned = src.trim().replace(/^["']+|["']+$/g, '').trim();
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // continua tentando próxima fonte
    }
  }
  return null;
}

function extractCleanSupabaseKey(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (typeof src !== 'string' || !src.trim()) continue;

    // 1. Extrai chave no formato novo do Supabase: sb_publishable_...
    const publishableMatch = src.match(/sb_publishable_[a-zA-Z0-9_-]+/);
    if (publishableMatch && publishableMatch[0]) {
      return publishableMatch[0].trim();
    }

    // 2. Extrai chave no formato JWT clássico: eyJ...
    const jwtMatch = src.match(
      /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/
    );
    if (jwtMatch && jwtMatch[0]) {
      return jwtMatch[0].trim();
    }

    // 3. Caso seja uma chave limpa direta sem prefixos KEY=
    const cleaned = src.trim().replace(/^["']+|["']+$/g, '').trim();
    if (cleaned && !cleaned.includes('=') && !cleaned.includes(' ')) {
      return cleaned;
    }
  }
  return null;
}

const metaEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ||
  (typeof process !== 'undefined' ? process.env : {});

const rawEnvUrl = metaEnv.VITE_SUPABASE_URL;
const rawEnvKey =
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY || metaEnv.VITE_SUPABASE_ANON_KEY;

export const supabaseUrl = extractCleanSupabaseUrl(rawEnvUrl, rawEnvKey);
export const supabasePublishableKey = extractCleanSupabaseKey(
  rawEnvKey,
  rawEnvUrl
);

const parsedHostname = (() => {
  if (!supabaseUrl) return 'none';
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return 'invalid-url';
  }
})();

const safeKeyPrefix = supabasePublishableKey
  ? supabasePublishableKey.startsWith('sb_publishable_')
    ? 'sb_publishable_'
    : supabasePublishableKey.slice(0, 15)
  : 'none';

// Logs seguros de diagnóstico (NUNCA exibe a chave completa)
console.info('[Supabase Diagnostic] Configuração carregada:', {
  VITE_SUPABASE_URL_loaded: Boolean(supabaseUrl),
  hostname: parsedHostname,
  VITE_SUPABASE_PUBLISHABLE_KEY_loaded: Boolean(supabasePublishableKey),
  keyPrefix: safeKeyPrefix,
});

let client: SupabaseClient | null = null;

if (supabaseUrl && supabasePublishableKey) {
  try {
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.error('[Supabase Diagnostic] Erro ao criar cliente Supabase:', err);
    client = null;
  }
}

export const isSupabaseConfigured = Boolean(client);
export const supabase: SupabaseClient | null = client;

/**
 * Teste simples de conectividade com o Supabase antes do signUp / signIn
 */
export async function verifySupabaseConnectivity(): Promise<{
  ok: boolean;
  status?: number;
  error?: unknown;
}> {
  if (!supabase || !supabaseUrl || !supabasePublishableKey) {
    return {
      ok: false,
      error: 'Cliente Supabase não configurado.',
    };
  }

  try {
    const { error, status } = await supabase
      .from('interests')
      .select('slug')
      .limit(1);

    if (error) {
      console.error(
        '[Supabase Diagnostic] Erro no teste de conectividade:',
        error
      );
      return { ok: false, status, error };
    }

    console.info('[Supabase Diagnostic] Conectividade verificada com sucesso:', {
      hostname: parsedHostname,
      status,
    });
    return { ok: true, status };
  } catch (err) {
    console.error(
      '[Supabase Diagnostic] Exceção de rede no teste de conectividade:',
      err
    );
    return { ok: false, error: err };
  }
}

/**
 * Obtém o access_token (JWT) da sessão autenticada atual do Supabase no cliente.
 * NUNCA utiliza SUPABASE_SERVICE_ROLE_KEY no frontend.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
      return null;
    }
    return data.session.access_token;
  } catch {
    return null;
  }
}

let lastSyncedCookieToken: string | null = null;
let pendingCookieSyncPromise: Promise<boolean> | null = null;

/**
 * Sincroniza o JWT da sessão atual com o backend via POST /api/auth/session,
 * definindo um cookie HttpOnly + SameSite=Lax para que requisições nativas de mídia
 * (como <audio src="/api/audio/stream/:assetId"> com HTTP Range) sejam autenticadas
 * no servidor sem jamais colocar tokens em URLs.
 */
export async function syncServerAuthSessionCookie(
  explicitToken?: string | null
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const token = explicitToken || (await getSupabaseAccessToken());
  if (!token) return false;

  if (lastSyncedCookieToken === token) {
    return true;
  }

  if (pendingCookieSyncPromise) {
    return pendingCookieSyncPromise;
  }

  pendingCookieSyncPromise = (async () => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      });
      if (res.ok) {
        lastSyncedCookieToken = token;
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      pendingCookieSyncPromise = null;
    }
  })();

  return pendingCookieSyncPromise;
}

/**
 * Remove o cookie HttpOnly de sessão no backend ao encerrar a sessão.
 */
export async function clearServerAuthSessionCookie(): Promise<void> {
  lastSyncedCookieToken = null;
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // ignora falha de rede no logout
  }
}

/**
 * Constrói os headers HTTP com `Authorization: Bearer <access_token>` da sessão atual do Supabase.
 */
export async function getSupabaseAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getSupabaseAccessToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

