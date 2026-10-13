import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import {
  getHydratedTrailsFromSupabase,
  selectActiveTrailForUserInSupabase,
} from './src/services/trailsBackend';
import {
  executeDriveInventoryScan,
  loadStoredInventoryState,
  queryInventoryItems,
} from './src/services/driveInventoryBackend';
import {
  getSubscriptionForAuthenticatedUser,
  hasActivePremiumSubscriptionServerSide,
} from './src/services/subscriptionsBackend';
import {
  executePhase16BatchCatalogImport,
  loadLatestBatchImportReport,
} from './src/services/batchCatalogImporter';
import {
  executePhase17BatchCoversProcess,
  loadLatestCoverBatchReport,
} from './src/services/batchCoverGenerator';

const execFileAsync = promisify(execFile);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Pasta de teste exclusiva da Fase 3 (Importador CRT Books V1)
 * Nenhuma outra pasta do Google Drive é acessada.
 */
const TEST_DRIVE_FOLDER_ID = '10P1srKtIb8-bpNSgK_97eG7UMl-r0ps_';
const BOOK_COVERS_BUCKET = 'book-covers';

/**
 * Renderiza exclusivamente a PRIMEIRA PÁGINA (página 1) de um buffer PDF em WebP otimizado
 * utilizando Ghostscript (/usr/bin/gs) + ImageMagick (/usr/bin/convert) no backend.
 * Preserva a proporção original da página com largura máxima de 640px (entre 500 e 800 px).
 */
async function renderPdfFirstPageToWebp(
  pdfBuffer: Buffer,
  workId: string
): Promise<{ webpBuffer: Buffer; widthHeight?: string }> {
  const uniqueSuffix = `${workId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpDir = os.tmpdir();
  const tmpPdfPath = path.join(tmpDir, `crt_src_${uniqueSuffix}.pdf`);
  const tmpPngPath = path.join(tmpDir, `crt_p1_${uniqueSuffix}.png`);
  const tmpWebpPath = path.join(tmpDir, `crt_cov_${uniqueSuffix}.webp`);

  try {
    await fs.promises.writeFile(tmpPdfPath, pdfBuffer);

    // 1. Renderizar somente a página 1 do PDF via Ghostscript
    await execFileAsync('/usr/bin/gs', [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dFirstPage=1',
      '-dLastPage=1',
      '-sDEVICE=png16m',
      '-r150',
      '-dTextAlphaBits=4',
      '-dGraphicsAlphaBits=4',
      `-sOutputFile=${tmpPngPath}`,
      tmpPdfPath,
    ]);

    if (!fs.existsSync(tmpPngPath)) {
      throw new Error(
        'Ghostscript não gerou a imagem da primeira página do PDF.'
      );
    }

    // 2. Converter e otimizar para WebP (largura ~640px mantendo proporção original) via ImageMagick
    await execFileAsync('/usr/bin/convert', [
      tmpPngPath,
      '-resize',
      '640x>',
      '-quality',
      '82',
      tmpWebpPath,
    ]);

    if (!fs.existsSync(tmpWebpPath)) {
      throw new Error('ImageMagick não gerou o arquivo WebP otimizado.');
    }

    let widthHeight: string | undefined;
    try {
      const { stdout } = await execFileAsync('/usr/bin/identify', [
        '-format',
        '%wx%h',
        tmpWebpPath,
      ]);
      widthHeight = stdout.trim();
    } catch {
      // ignore optional identify metadata
    }

    const webpBuffer = await fs.promises.readFile(tmpWebpPath);
    if (!webpBuffer || webpBuffer.length === 0) {
      throw new Error('Arquivo WebP gerado está vazio.');
    }

    return { webpBuffer, widthHeight };
  } finally {
    for (const f of [tmpPdfPath, tmpPngPath, tmpWebpPath]) {
      try {
        if (fs.existsSync(f)) {
          await fs.promises.unlink(f);
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

function extractCleanSupabaseUrl(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (typeof src !== 'string' || !src.trim()) continue;
    const directMatch = src.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
    if (directMatch && directMatch[0]) return directMatch[0].trim();
  }
  return null;
}

function extractCleanSupabaseKey(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (typeof src !== 'string' || !src.trim()) continue;
    const secretMatch = src.match(/sb_secret_[a-zA-Z0-9_-]+/);
    if (secretMatch && secretMatch[0]) return secretMatch[0].trim();
    const jwtMatch = src.match(
      /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/
    );
    if (jwtMatch && jwtMatch[0]) return jwtMatch[0].trim();
    const cleaned = src.trim().replace(/^["']+|["']+$/g, '').trim();
    if (
      cleaned &&
      !cleaned.includes('=') &&
      !cleaned.includes(' ') &&
      !cleaned.startsWith('sb_publishable_')
    ) {
      return cleaned;
    }
  }
  return null;
}

/**
 * Cliente administrativo do Supabase exclusivo do backend (server.ts).
 * Utiliza SOMENTE SUPABASE_SERVICE_ROLE_KEY (nunca exposta ao frontend).
 */
function getAdminSupabaseClient() {
  const url = extractCleanSupabaseUrl(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  );
  const serviceRoleKey = extractCleanSupabaseKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getAuthVerificationSupabaseClient() {
  const adminClient = getAdminSupabaseClient();
  if (adminClient) return adminClient;

  const url = extractCleanSupabaseUrl(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  );
  const pubKey =
    (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      '').trim();

  if (!url || !pubKey) {
    return null;
  }

  return createClient(url, pubKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  emailVerified: boolean;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthenticatedRequestUser;
    }
  }
}

const AUTH_COOKIE_NAME = 'crt_sb_access_token';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return result;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

/**
 * Extrai o token JWT exclusivamente do header `Authorization: Bearer <token>`
 * ou do cookie seguro `HttpOnly` (`crt_sb_access_token`).
 * NUNCA aceita tokens em query string / URL.
 */
function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}

function hasForbiddenTokenInUrl(req: express.Request): boolean {
  const q = req.query || {};
  return Boolean(
    q.token ||
      q.access_token ||
      q.jwt ||
      q.auth ||
      q.bearer ||
      q.supabase_token
  );
}

function getRequestedUserIdCandidate(req: express.Request): string | null {
  const fromQuery =
    typeof req.query?.userId === 'string' ? req.query.userId.trim() : '';
  if (fromQuery) return fromQuery;

  const fromBody =
    typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  if (fromBody) return fromBody;

  const fromParams =
    typeof req.params?.userId === 'string' ? req.params.userId.trim() : '';
  if (fromParams) return fromParams;

  return null;
}

/**
 * FASE 11 — Middleware de autenticação que valida o JWT no Supabase Auth (`auth.getUser(token)`),
 * obtém `user.id` exclusivamente da sessão autenticada, retorna HTTP 401 para ausência/invalidez de token
 * e HTTP 403 caso a requisição tente informar `userId` divergente do usuário autenticado.
 */
const requireSupabaseAuth: express.RequestHandler = async (req, res, next) => {
  if (hasForbiddenTokenInUrl(req)) {
    res.status(400).json({
      ok: false,
      code: 'TOKEN_IN_URL_FORBIDDEN',
      message:
        'Por segurança, tokens de sessão não podem ser enviados na URL.',
    });
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED_MISSING_TOKEN',
      message: 'Autenticação obrigatória. Token de sessão ausente.',
    });
    return;
  }

  const authSb = getAuthVerificationSupabaseClient();
  if (!authSb) {
    res.status(428).json({
      ok: false,
      code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
      message: 'Cliente Supabase de servidor não disponível para validar sessão.',
    });
    return;
  }

  try {
    const { data, error } = await authSb.auth.getUser(token);
    if (error || !data?.user?.id) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED_INVALID_TOKEN',
        message: 'Sessão inválida ou expirada. Faça login novamente.',
      });
      return;
    }

    const authenticatedId = String(data.user.id).trim();
    const candidateUserId = getRequestedUserIdCandidate(req);

    // Se algum parâmetro/query/body enviou userId diferente da sessão autenticada -> HTTP 403
    if (
      candidateUserId &&
      candidateUserId.toLowerCase() !== authenticatedId.toLowerCase()
    ) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_USER_MISMATCH',
        message:
          'Acesso negado: não é permitido acessar ou modificar dados de outro usuário.',
      });
      return;
    }

    const userMeta =
      (data.user.user_metadata as Record<string, unknown> | undefined) || {};
    const emailVerified = Boolean(
      data.user.email_confirmed_at ||
        data.user.confirmed_at ||
        userMeta.email_verified === true
    );

    req.authUser = {
      id: authenticatedId,
      email: String(data.user.email || '').trim().toLowerCase(),
      emailVerified,
      appMetadata:
        (data.user.app_metadata as Record<string, unknown> | undefined) || {},
      userMetadata: userMeta,
    };

    if (
      process.env.CRT_PRIVATE_TEST_MODE === 'true' &&
      !(await isAuthorizedDevTestAccount(req.authUser))
    ) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_DEV_TEST_ACCOUNT_REQUIRED',
        message:
          'Acesso restrito: esta implantação de teste privado do CRT Books é exclusiva para contas de teste autorizadas no servidor.',
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[CRT Auth Middleware] Erro ao validar sessão Supabase:', err);
    res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED_VERIFICATION_ERROR',
      message: 'Não foi possível validar o token de sessão.',
    });
  }
};

/**
 * Resolve opcionalmente o usuário autenticado a partir do header Authorization: Bearer
 * ou do cookie seguro HttpOnly (crt_sb_access_token) sem interromper a requisição.
 */
async function resolveOptionalAuthenticatedUser(
  req: express.Request
): Promise<AuthenticatedRequestUser | null> {
  if (req.authUser) return req.authUser;
  const token = extractBearerToken(req);
  if (!token) return null;

  const authSb = getAuthVerificationSupabaseClient();
  if (!authSb) return null;

  try {
    const { data, error } = await authSb.auth.getUser(token);
    if (error || !data?.user?.id) return null;

    const userMeta =
      (data.user.user_metadata as Record<string, unknown> | undefined) || {};
    const emailVerified = Boolean(
      data.user.email_confirmed_at ||
        data.user.confirmed_at ||
        userMeta.email_verified === true
    );

    const resolved: AuthenticatedRequestUser = {
      id: String(data.user.id).trim(),
      email: String(data.user.email || '').trim().toLowerCase(),
      emailVerified,
      appMetadata:
        (data.user.app_metadata as Record<string, unknown> | undefined) || {},
      userMetadata: userMeta,
    };
    req.authUser = resolved;
    return resolved;
  } catch {
    return null;
  }
}

function parseCsvEnvList(...rawValues: Array<string | undefined>): Set<string> {
  const result = new Set<string>();
  for (const raw of rawValues) {
    if (!raw || typeof raw !== 'string') continue;
    for (const part of raw.split(',')) {
      const cleaned = part.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase();
      if (cleaned) {
        result.add(cleaned);
      }
    }
  }
  return result;
}

/**
 * Verifica se o usuário autenticado possui autorização administrativa explícita:
 * 1. Configurado em variáveis de servidor (`CRT_ADMIN_EMAILS`, `ADMIN_EMAILS`, `CRT_ADMIN_USER_IDS`, `ADMIN_USER_IDS`);
 * 2. Marcado em `app_metadata` do Supabase Auth (`role === 'admin'` ou `is_admin === true`);
 * 3. Ou registrado em `public.profiles` com `role = 'admin'` ou `is_admin = true` (se a coluna existir).
 */
async function isAuthorizedSupabaseAdmin(
  authUser: AuthenticatedRequestUser
): Promise<boolean> {
  const configuredAdminEmails = parseCsvEnvList(
    process.env.CRT_ADMIN_EMAILS,
    process.env.ADMIN_EMAILS
  );
  const configuredAdminUserIds = parseCsvEnvList(
    process.env.CRT_ADMIN_USER_IDS,
    process.env.ADMIN_USER_IDS
  );

  if (
    authUser.email &&
    configuredAdminEmails.has(authUser.email.toLowerCase())
  ) {
    return true;
  }

  if (
    authUser.id &&
    configuredAdminUserIds.has(authUser.id.toLowerCase())
  ) {
    return true;
  }

  const appRole = String(authUser.appMetadata?.role || '').toLowerCase();
  if (appRole === 'admin' || authUser.appMetadata?.is_admin === true) {
    return true;
  }

  const hasCustomAdminAllowlist =
    configuredAdminEmails.size > 0 || configuredAdminUserIds.size > 0;

  if (
    !hasCustomAdminAllowlist &&
    process.env.CRT_DISABLE_DEFAULT_ADMIN_ACCOUNTS !== 'true'
  ) {
    if (
      authUser.email &&
      DEFAULT_EXPLICIT_DEV_TEST_EMAILS.includes(
        authUser.email.toLowerCase() as (typeof DEFAULT_EXPLICIT_DEV_TEST_EMAILS)[number]
      )
    ) {
      return true;
    }
    if (
      authUser.id &&
      DEFAULT_EXPLICIT_DEV_TEST_USER_IDS.includes(
        authUser.id.toLowerCase() as (typeof DEFAULT_EXPLICIT_DEV_TEST_USER_IDS)[number]
      )
    ) {
      return true;
    }
  }

  const adminSb = getAdminSupabaseClient();
  if (adminSb && authUser.id) {
    try {
      const { data: profileRow, error: profileErr } = await adminSb
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!profileErr && profileRow && typeof profileRow === 'object') {
        const rec = profileRow as Record<string, unknown>;
        if (
          String(rec.role || '').toLowerCase() === 'admin' ||
          rec.is_admin === true
        ) {
          return true;
        }
      }
    } catch {
      // ignora erro de consulta opcional
    }
  }

  return false;
}

const DEFAULT_EXPLICIT_DEV_TEST_EMAILS = [
  'konectamidia@gmail.com',
  'rodrigotvnova@gmail.com',
] as const;

const DEFAULT_EXPLICIT_DEV_TEST_USER_IDS = [
  '3a399563-b680-44f1-8734-3f6ec6d5a00d',
] as const;

/**
 * FASE 12 — Verifica se o usuário autenticado é uma conta de teste explicitamente
 * autorizada no servidor para acessar obras em rascunho / direitos pendentes no ambiente privado.
 * Nunca libera automaticamente com base apenas em NODE_ENV ou cadastro comum.
 * Critérios aceitos (exclusivamente server-side):
 * 1. Administrador autorizado (`isAuthorizedSupabaseAdmin`);
 * 2. E-mail ou UUID listado em `CRT_ALLOWED_TEST_EMAILS` / `CRT_ALLOWED_TEST_USER_IDS` (ou `ALLOWED_TEST_EMAILS` / `ALLOWED_TEST_USER_IDS`);
 * 3. Marcação em `app_metadata` do Supabase Auth (`allowed_test_account === true`, `dev_tester === true` ou `role === 'tester'`);
 * 4. Contas de teste proprietárias registradas no servidor (`DEFAULT_EXPLICIT_DEV_TEST_EMAILS` / `DEFAULT_EXPLICIT_DEV_TEST_USER_IDS`),
 *    caso nenhuma lista customizada tenha sido definida e `CRT_DISABLE_DEFAULT_TEST_ACCOUNTS !== 'true'`.
 */
async function isAuthorizedDevTestAccount(
  authUser: AuthenticatedRequestUser
): Promise<boolean> {
  if (process.env.CRT_ALLOW_DEV_TEST_ACCESS === 'false') {
    return false;
  }

  if (await isAuthorizedSupabaseAdmin(authUser)) {
    return true;
  }

  const appRole = String(authUser.appMetadata?.role || '').toLowerCase();
  if (
    authUser.appMetadata?.allowed_test_account === true ||
    authUser.appMetadata?.dev_tester === true ||
    appRole === 'tester'
  ) {
    return true;
  }

  const configuredTestEmails = parseCsvEnvList(
    process.env.CRT_ALLOWED_TEST_EMAILS,
    process.env.ALLOWED_TEST_EMAILS
  );
  const configuredTestUserIds = parseCsvEnvList(
    process.env.CRT_ALLOWED_TEST_USER_IDS,
    process.env.ALLOWED_TEST_USER_IDS
  );

  const hasCustomAllowlist =
    configuredTestEmails.size > 0 || configuredTestUserIds.size > 0;

  if (hasCustomAllowlist) {
    if (
      authUser.email &&
      configuredTestEmails.has(authUser.email.toLowerCase())
    ) {
      return true;
    }
    if (
      authUser.id &&
      configuredTestUserIds.has(authUser.id.toLowerCase())
    ) {
      return true;
    }
    return false;
  }

  if (process.env.CRT_DISABLE_DEFAULT_TEST_ACCOUNTS === 'true') {
    return false;
  }

  if (
    authUser.email &&
    DEFAULT_EXPLICIT_DEV_TEST_EMAILS.includes(
      authUser.email.toLowerCase() as (typeof DEFAULT_EXPLICIT_DEV_TEST_EMAILS)[number]
    )
  ) {
    return true;
  }

  if (
    authUser.id &&
    DEFAULT_EXPLICIT_DEV_TEST_USER_IDS.includes(
      authUser.id.toLowerCase() as (typeof DEFAULT_EXPLICIT_DEV_TEST_USER_IDS)[number]
    )
  ) {
    return true;
  }

  return false;
}

/**
 * FASE 11 — Middleware de proteção administrativa para todas as rotas `/api/admin/*`.
 * 1. Valida primeiro a sessão do Supabase (retorna HTTP 401 se não autenticado).
 * 2. Verifica se o usuário autenticado é administrador autorizado (retorna HTTP 403 se não autorizado).
 */
const requireSupabaseAdmin: express.RequestHandler = async (req, res, next) => {
  await requireSupabaseAuth(req, res, async () => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Autenticação obrigatória.',
      });
      return;
    }

    const isAdmin = await isAuthorizedSupabaseAdmin(authUser);
    if (!isAdmin) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_ADMIN_ONLY',
        message:
          'Acesso negado: esta operação é restrita a administradores autorizados.',
      });
      return;
    }

    next();
  });
};

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedServiceAccountToken: {
  token: string;
  expiresAtMs: number;
} | null = null;

/**
 * Gera um Access Token OAuth2 usando Service Account JSON no backend (sem expor segredos no frontend)
 */
async function getServiceAccountAccessToken(
  rawJson: string
): Promise<string> {
  if (
    cachedServiceAccountToken &&
    Date.now() < cachedServiceAccountToken.expiresAtMs
  ) {
    return cachedServiceAccountToken.token;
  }

  let creds: ServiceAccountCredentials;
  try {
    creds = JSON.parse(rawJson) as ServiceAccountCredentials;
  } catch {
    throw new Error(
      'A variável GOOGLE_SERVICE_ACCOUNT_JSON não contém um JSON válido.'
    );
  }

  if (!creds.client_email || !creds.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON precisa conter client_email e private_key.'
    );
  }

  const tokenUri = creds.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };

  const base64UrlEncode = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const privateKey = creds.private_key.replace(/\\n/g, '\n');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${unsignedToken}.${signature}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Falha ao autenticar Service Account no Google (${response.status}): ${errText}`
    );
  }

  const tokenData = (await response.json()) as { access_token: string };
  cachedServiceAccountToken = {
    token: tokenData.access_token,
    expiresAtMs: Date.now() + 50 * 60 * 1000,
  };
  return tokenData.access_token;
}

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());

  /**
   * FASE 15 — Cabeçalhos explícitos para Web App Manifest e Service Worker do PWA
   */
  app.get(['/manifest.webmanifest', '/manifest.json'], (_req, res) => {
    const manifestPath = path.join(__dirname, 'public', 'manifest.webmanifest');
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.sendFile(manifestPath);
  });

  app.get('/sw.js', (_req, res) => {
    const swPath = path.join(__dirname, 'public', 'sw.js');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(swPath);
  });

  /**
   * FASE 12 — Sincronização segura da sessão autenticada via cookie HttpOnly + SameSite=Lax.
   * Permite que o elemento nativo <audio src="/api/audio/stream/:assetId"> envie a sessão
   * automaticamente em todas as requisições HTTP Range sem expor tokens em URLs.
   */
  app.post('/api/auth/session', requireSupabaseAuth, (req, res) => {
    const token = extractBearerToken(req);
    if (!token || !req.authUser) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Sessão inválida.',
      });
      return;
    }

    const isSecure =
      req.secure ||
      String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const cookieParts = [
      `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/api',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=3600',
    ];
    if (isSecure) {
      cookieParts.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieParts.join('; '));
    res.json({
      ok: true,
      userId: req.authUser.id,
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${AUTH_COOKIE_NAME}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0`
    );
    res.json({ ok: true });
  });

  // Protege todas as rotas administrativas /api/admin/* exigindo sessão Supabase válida (401) e permissão de administrador (403)
  app.use('/api/admin', requireSupabaseAdmin);

  /**
   * Endpoint administrativo server-side para listar exclusivamente os arquivos
   * da pasta de teste 10P1srKtIb8-bpNSgK_97eG7UMl-r0ps_ no Google Drive.
   */
  app.get(
    '/api/admin/drive/test-folder',
    requireSupabaseAdmin,
    async (_req, res) => {
    const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();
    const serviceAccountJson = (
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
    ).trim();

    if (!driveApiKey && !serviceAccountJson) {
      res.status(428).json({
        ok: false,
        code: 'DRIVE_CREDENTIAL_MISSING',
        folderId: TEST_DRIVE_FOLDER_ID,
        message:
          'Credencial da Google Drive API ainda não configurada no servidor. Configure GOOGLE_DRIVE_API_KEY (para pasta compartilhada com link) ou GOOGLE_SERVICE_ACCOUNT_JSON (para pasta privada compartilhada com a conta de serviço) nas variáveis de ambiente do Google AI Studio.',
      });
      return;
    }

    try {
      const query = `'${TEST_DRIVE_FOLDER_ID}' in parents and trashed = false`;
      const fields =
        'files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime)';
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', query);
      url.searchParams.set('fields', fields);
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      url.searchParams.set('supportsAllDrives', 'true');

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (serviceAccountJson) {
        const accessToken =
          await getServiceAccountAccessToken(serviceAccountJson);
        headers.Authorization = `Bearer ${accessToken}`;
      } else if (driveApiKey) {
        url.searchParams.set('key', driveApiKey);
      }

      const driveRes = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      const payload = await driveRes.json();

      if (!driveRes.ok) {
        res.status(driveRes.status).json({
          ok: false,
          code: 'DRIVE_API_ERROR',
          folderId: TEST_DRIVE_FOLDER_ID,
          message:
            payload?.error?.message ||
            `Erro retornado pela Google Drive API (HTTP ${driveRes.status}).`,
          details: payload?.error || payload,
        });
        return;
      }

      const files = Array.isArray(payload.files) ? payload.files : [];

      // Verificar duplicidade diretamente no backend via SUPABASE_SERVICE_ROLE_KEY se disponível
      const existingAssetsMap: Record<string, string | null> = {};
      const adminSb = getAdminSupabaseClient();
      if (adminSb && files.length > 0) {
        const driveIds = files
          .map((f: { id?: string }) => f.id)
          .filter(Boolean);
        if (driveIds.length > 0) {
          const { data: existingRows } = await adminSb
            .from('assets')
            .select('drive_file_id, work_id')
            .in('drive_file_id', driveIds);
          if (existingRows) {
            for (const row of existingRows as Array<{
              drive_file_id: string;
              work_id: string | null;
            }>) {
              if (row.drive_file_id) {
                existingAssetsMap[row.drive_file_id] = row.work_id || null;
              }
            }
          }
        }
      }

      res.json({
        ok: true,
        folderId: TEST_DRIVE_FOLDER_ID,
        rawFileCount: files.length,
        files,
        existingAssetsMap,
      });
    } catch (err) {
      console.error('[CRT Importer Backend] Erro ao consultar Google Drive:', err);
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_DRIVE_ERROR',
        folderId: TEST_DRIVE_FOLDER_ID,
        message:
          err instanceof Error
            ? err.message
            : 'Erro inesperado ao consultar a pasta de teste no Google Drive.',
      });
    }
  });

  /**
   * Diagnóstico seguro da disponibilidade de SUPABASE_SERVICE_ROLE_KEY no servidor
   * (NUNCA retorna ou imprime o valor da chave).
   */
  app.get(
    '/api/admin/supabase-status',
    requireSupabaseAdmin,
    (_req, res) => {
      const sb = getAdminSupabaseClient();
      res.json({
        ok: true,
        supabaseServiceRoleKeyConfigured: Boolean(sb),
      });
    }
  );

  /**
   * FASE 13 — CONSULTA DO INVENTÁRIO AUTOMÁTICO DO ACERVO (GET /api/admin/inventory)
   * Protegido por `requireSupabaseAdmin`:
   * - Retorna HTTP 401 se não autenticado;
   * - Retorna HTTP 403 se o usuário não for administrador autorizado;
   * - Retorna o relatório consolidado do inventário persistido no Supabase e a página filtrada de itens.
   */
  app.get(
    '/api/admin/inventory',
    requireSupabaseAdmin,
    async (req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'Configuração administrativa do Supabase ausente no servidor.',
        });
        return;
      }

      try {
        let state = await loadStoredInventoryState(sb);

        if (!state && String(req.query.autoRun || '').toLowerCase() === 'true') {
          const serviceAccountJson = (
            process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
          ).trim();
          const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();
          if (serviceAccountJson || driveApiKey) {
            const accessToken = serviceAccountJson
              ? await getServiceAccountAccessToken(serviceAccountJson)
              : null;
            state = await executeDriveInventoryScan({
              sb,
              accessToken,
              apiKey: driveApiKey,
            });
          }
        }

        if (!state) {
          res.json({
            ok: true,
            hasInventory: false,
            report: null,
            pagination: {
              totalFiltered: 0,
              page: 1,
              pageSize: 50,
              totalPages: 1,
            },
            items: [],
          });
          return;
        }

        const queried = queryInventoryItems(state, {
          sourceKey: String(req.query.source || 'all'),
          candidateType: String(req.query.candidateType || 'all'),
          filter: String(req.query.filter || 'all'),
          extension: String(req.query.extension || 'all'),
          search: String(req.query.search || ''),
          page: Number(req.query.page) || 1,
          pageSize: Number(req.query.pageSize) || 50,
        });

        res.json({
          ok: true,
          hasInventory: true,
          report: state.report,
          pagination: {
            totalFiltered: queried.totalFiltered,
            page: queried.page,
            pageSize: queried.pageSize,
            totalPages: queried.totalPages,
          },
          items: queried.items,
        });
      } catch (err) {
        console.error(
          '[CRT Inventory Backend] Erro em GET /api/admin/inventory:',
          err
        );
        res.status(500).json({
          ok: false,
          code: 'INVENTORY_QUERY_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro interno ao consultar o inventário do acervo.',
        });
      }
    }
  );

  /**
   * FASE 13 — EXECUÇÃO DO INVENTÁRIO AUTOMÁTICO DO ACERVO (POST /api/admin/inventory/run)
   * Protegido por `requireSupabaseAdmin`:
   * - Percorre de forma paginada as 3 origens no Google Drive usando a conta de serviço;
   * - Exclui a pasta Super Bônus de 3.500 ebooks;
   * - Registra metadados, classifica PDF/EPUB (ebook) e MP3/M4A (audio), detecta duplicatas e problemas;
   * - Persiste o inventário de forma idempotente no Supabase, separado de works e assets públicos.
   */
  app.post(
    '/api/admin/inventory/run',
    requireSupabaseAdmin,
    async (req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'Configuração administrativa do Supabase ausente no servidor.',
        });
        return;
      }

      const serviceAccountJson = (
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
      ).trim();
      const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();

      if (!serviceAccountJson && !driveApiKey) {
        res.status(428).json({
          ok: false,
          code: 'DRIVE_CREDENTIAL_MISSING',
          message:
            'Credencial do Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON) ausente no servidor.',
        });
        return;
      }

      try {
        const accessToken = serviceAccountJson
          ? await getServiceAccountAccessToken(serviceAccountJson)
          : null;

        const state = await executeDriveInventoryScan({
          sb,
          accessToken,
          apiKey: driveApiKey,
        });

        const queried = queryInventoryItems(state, {
          sourceKey: String(req.body?.source || 'all'),
          candidateType: String(req.body?.candidateType || 'all'),
          filter: String(req.body?.filter || 'all'),
          extension: String(req.body?.extension || 'all'),
          search: String(req.body?.search || ''),
          page: 1,
          pageSize: 50,
        });

        res.json({
          ok: true,
          hasInventory: true,
          report: state.report,
          pagination: {
            totalFiltered: queried.totalFiltered,
            page: queried.page,
            pageSize: queried.pageSize,
            totalPages: queried.totalPages,
          },
          items: queried.items,
        });
      } catch (err) {
        console.error(
          '[CRT Inventory Backend] Erro em POST /api/admin/inventory/run:',
          err
        );
        res.status(500).json({
          ok: false,
          code: 'INVENTORY_RUN_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro interno ao executar o inventário do Google Drive.',
        });
      }
    }
  );

  /**
   * Endpoint de leitura do catálogo real do Supabase para a tela Biblioteca e demais telas do app.
   * - Em acesso público estrito (NODE_ENV === 'production' sem CRT_ALLOW_PREVIEW_PENDING === 'true'),
   *   retorna apenas obras publicadas com direitos autorais aprovados ('approved', 'public_domain', 'own_content').
   * - Em ambiente privado de testes, preserva a leitura das obras reais de teste (status = 'draft' / rights_status = 'pending'),
   *   excluindo qualquer obra com rights_status = 'blocked', SEM alterar nenhum registro ou política RLS no banco.
   */
  app.get('/api/library/works', async (req, res) => {
    if (hasForbiddenTokenInUrl(req)) {
      res.status(400).json({
        ok: false,
        code: 'TOKEN_IN_URL_FORBIDDEN',
        message: 'Por segurança, tokens de sessão não podem ser enviados na URL.',
      });
      return;
    }

    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message:
          'Cliente Supabase de servidor não disponível para leitura em modo de teste.',
      });
      return;
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    const explicitPublic = isExplicitPublicCommercialContext(req);
    const authUser = explicitPublic
      ? null
      : await resolveOptionalAuthenticatedUser(req);

    // Se houver usuário autenticado e o modo de teste privado estiver ativo, valida se a conta está autorizada
    let isAuthorizedTester = false;
    if (authUser) {
      isAuthorizedTester = await isAuthorizedDevTestAccount(authUser);
      if (
        process.env.CRT_PRIVATE_TEST_MODE === 'true' &&
        !isAuthorizedTester &&
        !explicitPublic
      ) {
        res.status(403).json({
          ok: false,
          code: 'FORBIDDEN_DEV_TEST_ACCOUNT_REQUIRED',
          message:
            'Acesso restrito: sua conta não está na lista de contas de teste autorizadas no servidor para acessar o acervo em validação.',
        });
        return;
      }
    } else if (
      !explicitPublic &&
      (process.env.CRT_PRIVATE_TEST_MODE === 'true' ||
        process.env.CRT_REQUIRE_AUTH_FOR_LIBRARY === 'true')
    ) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED_MISSING_TOKEN',
        message:
          'Autenticação obrigatória no servidor para acessar o catálogo na versão privada de teste.',
      });
      return;
    }

    const isStrictProduction =
      explicitPublic ||
      (!isAuthorizedTester &&
        (isPublicAccessContext(req) ||
          (process.env.NODE_ENV === 'production' &&
            process.env.CRT_ALLOW_PREVIEW_PENDING !== 'true')));

    try {
      let worksQuery = sb
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
            status,
            created_at,
            updated_at
          )
        `
        )
        .neq('rights_status', 'blocked')
        .order('created_at', { ascending: true });

      if (isStrictProduction) {
        worksQuery = worksQuery
          .eq('status', 'published')
          .in('rights_status', ['approved', 'public_domain', 'own_content']);
      }

      const [
        { data: worksData, error: worksErr },
        { data: workCategoriesData },
        { data: workTagsData },
      ] = await Promise.all([
        worksQuery.range(0, 1999),
        sb
          .from('work_categories')
          .select('work_id, categories ( id, name, slug )')
          .range(0, 4999),
        sb
          .from('work_tags')
          .select('work_id, tags ( id, name, slug )')
          .range(0, 4999),
      ]);

      if (worksErr) {
        res.status(500).json({
          ok: false,
          code: worksErr.code || 'SUPABASE_QUERY_ERROR',
          message: worksErr.message,
        });
        return;
      }

      const categoriesByWorkId = new Map<string, string[]>();
      if (Array.isArray(workCategoriesData)) {
        for (const row of workCategoriesData as Array<{
          work_id: string;
          categories?:
            | { id?: string; name?: string; slug?: string }
            | Array<{ id?: string; name?: string; slug?: string }>
            | null;
        }>) {
          const catObj = Array.isArray(row.categories)
            ? row.categories[0]
            : row.categories;
          const catName = catObj?.name?.trim();
          if (row.work_id && catName) {
            const list = categoriesByWorkId.get(row.work_id) || [];
            if (!list.includes(catName)) list.push(catName);
            categoriesByWorkId.set(row.work_id, list);
          }
        }
      }

      const tagsByWorkId = new Map<string, string[]>();
      if (Array.isArray(workTagsData)) {
        for (const row of workTagsData as Array<{
          work_id: string;
          tags?:
            | { id?: string; name?: string; slug?: string }
            | Array<{ id?: string; name?: string; slug?: string }>
            | null;
        }>) {
          const tagObj = Array.isArray(row.tags) ? row.tags[0] : row.tags;
          const tagName = tagObj?.name?.trim();
          if (row.work_id && tagName) {
            const list = tagsByWorkId.get(row.work_id) || [];
            if (!list.includes(tagName)) list.push(tagName);
            tagsByWorkId.set(row.work_id, list);
          }
        }
      }

      const enrichedWorks = (worksData || []).map((w) => ({
        ...w,
        categories: categoriesByWorkId.get(w.id) || [],
        tags: tagsByWorkId.get(w.id) || [],
      }));

      res.json({
        ok: true,
        devTestMode: !isStrictProduction,
        count: enrichedWorks.length,
        works: enrichedWorks,
      });
    } catch (err) {
      console.error(
        '[CRT Library Backend] Erro ao buscar obras reais no Supabase:',
        err
      );
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_LIBRARY_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro inesperado ao carregar obras reais da Biblioteca.',
      });
    }
  });

  /**
   * Endpoint de leitura de uma obra única real pelo seu ID (/api/library/works/:workId).
   * Não expõe drive_file_id nem credenciais ao frontend.
   */
  app.get('/api/library/works/:workId', async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const workId = String(req.params.workId || '').trim();
    if (!workId) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_WORK_ID',
        message: 'ID da obra inválido.',
      });
      return;
    }

    try {
      const [
        { data: workData, error: workErr },
        { data: workCategoriesData },
        { data: workTagsData },
      ] = await Promise.all([
        sb
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
              status,
              created_at,
              updated_at
            )
          `
          )
          .eq('id', workId)
          .maybeSingle(),
        sb
          .from('work_categories')
          .select('work_id, categories ( id, name, slug )')
          .eq('work_id', workId),
        sb
          .from('work_tags')
          .select('work_id, tags ( id, name, slug )')
          .eq('work_id', workId),
      ]);

      if (workErr) {
        res.status(500).json({
          ok: false,
          code: workErr.code || 'SUPABASE_QUERY_ERROR',
          message: workErr.message,
        });
        return;
      }

      if (!workData) {
        res.status(404).json({
          ok: false,
          code: 'WORK_NOT_FOUND',
          message: 'Obra não encontrada no Supabase.',
        });
        return;
      }

      res.setHeader('Cache-Control', 'private, no-store, max-age=0');

      const authUser = await resolveOptionalAuthenticatedUser(req);
      const accessCheck = await evaluateWorkReaderAccess(
        workData,
        req,
        authUser
      );
      if (!accessCheck.allowed) {
        res.status(accessCheck.status || 403).json({
          ok: false,
          code: accessCheck.code || 'WORK_ACCESS_DENIED',
          message:
            accessCheck.message ||
            'Obra com direitos pendentes não disponível em acesso público.',
        });
        return;
      }

      const categories: string[] = [];
      if (Array.isArray(workCategoriesData)) {
        for (const row of workCategoriesData as Array<{
          categories?:
            | { name?: string }
            | Array<{ name?: string }>
            | null;
        }>) {
          const catObj = Array.isArray(row.categories)
            ? row.categories[0]
            : row.categories;
          const catName = catObj?.name?.trim();
          if (catName && !categories.includes(catName)) {
            categories.push(catName);
          }
        }
      }

      const tags: string[] = [];
      if (Array.isArray(workTagsData)) {
        for (const row of workTagsData as Array<{
          tags?: { name?: string } | Array<{ name?: string }> | null;
        }>) {
          const tagObj = Array.isArray(row.tags) ? row.tags[0] : row.tags;
          const tagName = tagObj?.name?.trim();
          if (tagName && !tags.includes(tagName)) {
            tags.push(tagName);
          }
        }
      }

      res.json({
        ok: true,
        work: {
          ...workData,
          categories,
          tags,
        },
      });
    } catch (err) {
      console.error(
        '[CRT Library Backend] Erro ao buscar obra por ID no Supabase:',
        err
      );
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_WORK_DETAIL_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro inesperado ao carregar detalhes da obra.',
      });
    }
  });

  /**
   * Identifica se a requisição solicitou explicitamente o modo comercial público
   * ou vem de URL compartilhada pública (`ais-pre-*`).
   */
  function isExplicitPublicCommercialContext(req?: express.Request): boolean {
    if (process.env.CRT_PUBLIC_COMMERCIAL_MODE === 'true') {
      return true;
    }

    if (!req) {
      return false;
    }

    const explicitContext = String(
      req.headers['x-crt-access-context'] || req.query?.context || ''
    )
      .trim()
      .toLowerCase();
    if (explicitContext === 'public') {
      return true;
    }

    const hostHeader = String(
      req.headers['x-forwarded-host'] || req.headers.host || ''
    )
      .trim()
      .toLowerCase();
    const originHeader = String(req.headers.origin || '')
      .trim()
      .toLowerCase();
    const refererHeader = String(req.headers.referer || '')
      .trim()
      .toLowerCase();

    if (
      hostHeader.includes('ais-pre-') ||
      originHeader.includes('ais-pre-') ||
      refererHeader.includes('ais-pre-')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Identifica se a requisição ocorre em contexto público quando não há conta de teste autenticada.
   */
  function isPublicAccessContext(req?: express.Request): boolean {
    if (isExplicitPublicCommercialContext(req)) {
      return true;
    }

    if (process.env.NODE_ENV === 'production') {
      return true;
    }

    if (!req) {
      return true;
    }

    const hostHeader = String(
      req.headers['x-forwarded-host'] || req.headers.host || ''
    )
      .trim()
      .toLowerCase();

    // Hosts privados de desenvolvimento local / AI Studio Dev
    const isPrivateDevHost =
      hostHeader.startsWith('localhost:') ||
      hostHeader === 'localhost' ||
      hostHeader.startsWith('127.0.0.1:') ||
      hostHeader === '127.0.0.1' ||
      hostHeader.includes('ais-dev-');

    if (!isPrivateDevHost) {
      return true;
    }

    return false;
  }

  /**
   * Regra de autorização de leitura por status e rights_status (Catálogo / Detalhes):
   * - Obras bloqueadas (`rights_status === 'blocked'` ou `status === 'archived'`) NUNCA são disponibilizadas.
   * - Obras com direitos pendentes (`rights_status === 'pending'` ou `status === 'draft'`) permanecem
   *   indisponíveis ao público comercial e exigem conta de teste autorizada no backend em implantações de teste.
   * - Em caso de dúvida, nega o acesso.
   */
  async function evaluateWorkReaderAccess(
    work: {
      status?: string | null;
      rights_status?: string | null;
    },
    req?: express.Request,
    authUser?: AuthenticatedRequestUser | null
  ): Promise<{
    allowed: boolean;
    status?: number;
    code?: string;
    message?: string;
  }> {
    if (!work || typeof work !== 'object') {
      return {
        allowed: false,
        status: 400,
        code: 'WORK_INVALID',
        message: 'Dados da obra inválidos.',
      };
    }

    const status = String(work.status || '').trim().toLowerCase();
    const rights = String(work.rights_status || '').trim().toLowerCase();

    if (!status || !rights) {
      return {
        allowed: false,
        status: 403,
        code: 'RIGHTS_UNKNOWN_DENIED',
        message: 'Acesso negado: status ou direitos da obra não identificados.',
      };
    }

    if (rights === 'blocked' || status === 'archived') {
      return {
        allowed: false,
        status: 403,
        code: 'RIGHTS_BLOCKED',
        message: 'Esta obra está bloqueada por restrições de direitos autorais.',
      };
    }

    const approvedRights = ['approved', 'public_domain', 'own_content'];
    if (status === 'published' && approvedRights.includes(rights)) {
      return { allowed: true, status: 200 };
    }

    if (
      (status === 'draft' || status === 'published') &&
      (rights === 'pending' || approvedRights.includes(rights))
    ) {
      if (isExplicitPublicCommercialContext(req)) {
        return {
          allowed: false,
          status: 403,
          code: 'RIGHTS_PENDING_PUBLIC_DENIED',
          message:
            'Acesso negado: obra em rascunho ou com direitos pendentes não está disponível em contexto público.',
        };
      }

      if (authUser) {
        const isAllowedTester = await isAuthorizedDevTestAccount(authUser);
        if (!isAllowedTester) {
          return {
            allowed: false,
            status: 403,
            code: 'FORBIDDEN_DEV_TEST_ACCOUNT_REQUIRED',
            message:
              'Acesso negado: esta obra está em validação e sua conta não faz parte das contas de teste autorizadas no servidor.',
          };
        }
        return { allowed: true, status: 200 };
      }

      if (process.env.CRT_PRIVATE_TEST_MODE === 'true') {
        return {
          allowed: false,
          status: 401,
          code: 'UNAUTHORIZED_MISSING_TOKEN',
          message:
            'Autenticação obrigatória com conta de teste autorizada para acessar obras em validação.',
        };
      }

      return { allowed: true, status: 200 };
    }

    return {
      allowed: false,
      status: 403,
      code: 'RIGHTS_ACCESS_DENIED',
      message: 'Acesso negado: obra sem autorização de disponibilização.',
    };
  }

  /**
   * FASE 12 — Avaliação completa de autorização para entrega de PDF e streaming de áudio:
   * 1. Exige usuário autenticado (`authUser`) validado no Supabase Auth.
   * 2. Verifica no banco (`public.profiles`) se o usuário possui perfil ativo e autorizado
   *    (`onboarding_completed === true`) ou é administrador autorizado.
   * 3. Verifica `asset.status`, `work.status` e `work.rights_status`:
   *    - Obras ou assets bloqueados/arquivados NUNCA são disponibilizados.
   *    - Obras com direitos pendentes ou em rascunho exigem simultaneamente:
   *      (a) contexto privado de desenvolvimento (`!isPublicAccessContext(req)`),
   *      (b) `NODE_ENV !== 'production'`, e
   *      (c) usuário autenticado com perfil ativo/autorizado e e-mail verificado no projeto.
   *    - Em caso de dúvida, nega o acesso (fail-closed).
   */
  async function evaluateProtectedMediaAccess(params: {
    req: express.Request;
    sb: NonNullable<ReturnType<typeof getAdminSupabaseClient>>;
    work: {
      id?: string | null;
      status?: string | null;
      rights_status?: string | null;
    } | null;
    assetStatus?: string | null;
    authUser?: AuthenticatedRequestUser;
  }): Promise<{ allowed: boolean; status: number; code: string; message: string }> {
    const { req, sb, work, assetStatus, authUser } = params;

    if (!authUser || !authUser.id) {
      return {
        allowed: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Autenticação obrigatória para acessar este conteúdo.',
      };
    }

    if (!work || !work.id) {
      return {
        allowed: false,
        status: 403,
        code: 'WORK_ACCESS_DENIED',
        message: 'Obra associada inválida ou inacessível.',
      };
    }

    const cleanAssetStatus = String(assetStatus || '').trim().toLowerCase();
    if (cleanAssetStatus === 'blocked' || cleanAssetStatus === 'archived') {
      return {
        allowed: false,
        status: 403,
        code: 'ASSET_BLOCKED',
        message: 'Este arquivo está bloqueado ou arquivado.',
      };
    }

    const workStatus = String(work.status || '').trim().toLowerCase();
    const rightsStatus = String(work.rights_status || '').trim().toLowerCase();

    // 1. Obras bloqueadas ou arquivadas NUNCA devem ser disponibilizadas (mesmo para admins/dev)
    if (rightsStatus === 'blocked' || workStatus === 'archived') {
      return {
        allowed: false,
        status: 403,
        code: 'RIGHTS_BLOCKED',
        message: 'Acesso negado: esta obra está bloqueada por restrições de direitos autorais.',
      };
    }

    if (!workStatus || !rightsStatus) {
      return {
        allowed: false,
        status: 403,
        code: 'RIGHTS_UNKNOWN_DENIED',
        message: 'Acesso negado: status ou direitos da obra ausentes.',
      };
    }

    // 2. Verificar se o usuário autenticado está bloqueado ou sem autorização
    if (
      authUser.appMetadata?.blocked === true ||
      authUser.appMetadata?.role === 'blocked' ||
      authUser.userMetadata?.unauthorized === true
    ) {
      return {
        allowed: false,
        status: 403,
        code: 'FORBIDDEN_USER_NOT_AUTHORIZED',
        message: 'Acesso negado: usuário sem autorização para acessar este conteúdo.',
      };
    }

    const isAdmin = await isAuthorizedSupabaseAdmin(authUser);
    let hasAuthorizedProfile = false;

    try {
      const { data: profileRow, error: profileErr } = await sb
        .from('profiles')
        .select('id, onboarding_completed')
        .eq('id', authUser.id)
        .maybeSingle();

      if (
        !profileErr &&
        profileRow &&
        Boolean(profileRow.onboarding_completed)
      ) {
        hasAuthorizedProfile = true;
      }
    } catch {
      hasAuthorizedProfile = false;
    }

    if (!hasAuthorizedProfile && !isAdmin) {
      return {
        allowed: false,
        status: 403,
        code: 'FORBIDDEN_USER_NOT_AUTHORIZED',
        message:
          'Acesso negado: seu usuário não possui perfil autorizado para acessar este conteúdo.',
      };
    }

    // 3. Verificar se a obra exige assinatura Premium (validado exclusivamente no servidor)
    let workRequiresPremium = false;
    try {
      const { data: tierRow, error: tierErr } = await sb
        .from('works')
        .select('access_tier')
        .eq('id', work.id)
        .maybeSingle();
      if (
        !tierErr &&
        tierRow &&
        String((tierRow as { access_tier?: string }).access_tier || '')
          .trim()
          .toLowerCase() === 'premium'
      ) {
        workRequiresPremium = true;
      }
    } catch {
      workRequiresPremium = false;
    }

    // 4. Obras publicadas e com direitos aprovados
    const approvedRights = ['approved', 'public_domain', 'own_content'];
    if (workStatus === 'published' && approvedRights.includes(rightsStatus)) {
      if (workRequiresPremium) {
        const hasPremium = await hasActivePremiumSubscriptionServerSide(
          sb,
          authUser.id
        );
        const canDevBypass =
          !isPublicAccessContext(req) &&
          (await isAuthorizedDevTestAccount(authUser));
        if (!hasPremium && !canDevBypass) {
          return {
            allowed: false,
            status: 403,
            code: 'PREMIUM_SUBSCRIPTION_REQUIRED',
            message:
              'Acesso negado: esta obra é exclusiva para assinantes com plano CRT Books Premium ativo.',
          };
        }
      }

      return {
        allowed: true,
        status: 200,
        code: 'ALLOWED',
        message: 'Acesso autorizado.',
      };
    }

    // 5. Obras com direitos pendentes ou em rascunho:
    //    - Indisponíveis em contexto público comercial (`isExplicitPublicCommercialContext(req)`);
    //    - NUNCA liberadas automaticamente apenas com base em NODE_ENV, assinatura ou perfil comum:
    //      exigem autorização explícita no servidor restrita às contas de teste permitidas (`isAuthorizedDevTestAccount`).
    if (
      (workStatus === 'draft' || workStatus === 'published') &&
      (rightsStatus === 'pending' || approvedRights.includes(rightsStatus))
    ) {
      if (isExplicitPublicCommercialContext(req)) {
        return {
          allowed: false,
          status: 403,
          code: 'RIGHTS_PENDING_PUBLIC_DENIED',
          message:
            'Acesso negado: obras com direitos pendentes permanecem indisponíveis ao público comercial.',
        };
      }

      const isAllowedTestAccount = await isAuthorizedDevTestAccount(authUser);
      if (!isAllowedTestAccount) {
        return {
          allowed: false,
          status: 403,
          code: 'FORBIDDEN_DEV_TEST_ACCOUNT_REQUIRED',
          message:
            'Acesso negado: esta obra está com direitos pendentes/rascunho e seu usuário não faz parte das contas de teste explicitamente autorizadas no servidor.',
        };
      }

      if (!authUser.emailVerified && !isAdmin) {
        return {
          allowed: false,
          status: 403,
          code: 'FORBIDDEN_UNVERIFIED_DEV_USER',
          message:
            'Acesso negado: usuário não verificado para acesso a obras em rascunho/direitos pendentes.',
        };
      }

      return {
        allowed: true,
        status: 200,
        code: 'ALLOWED_PRIVATE_DEV',
        message:
          'Acesso autorizado para conta de teste explicitamente permitida no servidor.',
      };
    }

    // 6. Em caso de dúvida, negar o acesso
    return {
      allowed: false,
      status: 403,
      code: 'ACCESS_DENIED_DEFAULT',
      message: 'Acesso negado por política de segurança.',
    };
  }

  /**
   * FASE 14 — SISTEMA DE ASSINATURAS (SOMENTE LEITURA PARA O CLIENTE, VALIDAÇÃO EXCLUSIVA NO BACKEND)
   * - GET /api/subscription/me retorna exclusivamente a assinatura do próprio usuário autenticado (`req.authUser.id`).
   * - Qualquer tentativa de consultar outro `userId` via query/params é bloqueada com HTTP 403 (`FORBIDDEN_USER_MISMATCH`).
   * - Qualquer tentativa do frontend de alterar, criar, ativar ou cancelar assinaturas (POST/PUT/PATCH/DELETE)
   *   é explicitamente bloqueada com HTTP 403 (`SUBSCRIPTION_MUTATION_FORBIDDEN`).
   */
  const handleGetMySubscription: express.RequestHandler = async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const authenticatedUserId = req.authUser!.id;

    try {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      const subscription = await getSubscriptionForAuthenticatedUser(
        sb,
        authenticatedUserId
      );
      res.json({
        ok: true,
        subscription,
      });
    } catch (err) {
      console.error(
        '[CRT Subscriptions Backend] Erro em GET /api/subscription/me:',
        err
      );
      res.status(500).json({
        ok: false,
        code: 'SUBSCRIPTION_QUERY_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao consultar dados da assinatura no servidor.',
      });
    }
  };

  const rejectClientSubscriptionMutation: express.RequestHandler = (
    _req,
    res
  ) => {
    res.status(403).json({
      ok: false,
      code: 'SUBSCRIPTION_MUTATION_FORBIDDEN',
      message:
        'Operação negada: o frontend não pode criar, alterar, ativar ou cancelar assinaturas. O gerenciamento de assinaturas ocorre exclusivamente no servidor.',
    });
  };

  app.use(['/api/subscription', '/api/subscriptions'], (req, res, next) => {
    if (req.method !== 'GET') {
      rejectClientSubscriptionMutation(req, res, next);
      return;
    }
    next();
  });

  app.get('/api/subscription/me', requireSupabaseAuth, handleGetMySubscription);
  app.get('/api/subscriptions/me', requireSupabaseAuth, handleGetMySubscription);
  app.get(
    '/api/subscription/:userId',
    requireSupabaseAuth,
    handleGetMySubscription
  );
  app.get(
    '/api/subscriptions/:userId',
    requireSupabaseAuth,
    handleGetMySubscription
  );

  /**
   * FASE 11 — ENDPOINTS PROTEGIDOS DE FAVORITOS (GET /api/favorites e POST /api/favorites)
   * Obtém `user.id` exclusivamente da sessão autenticada do Supabase.
   */
  app.get('/api/favorites', requireSupabaseAuth, async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const userId = req.authUser!.id;

    try {
      const { data, error } = await sb
        .from('favorites')
        .select('work_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        res.status(500).json({
          ok: false,
          code: error.code || 'SUPABASE_FAVORITES_QUERY_ERROR',
          message: error.message,
        });
        return;
      }

      res.json({
        ok: true,
        favorites: Array.isArray(data) ? data : [],
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_FAVORITES_QUERY_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao consultar favoritos do usuário.',
      });
    }
  });

  app.post('/api/favorites', requireSupabaseAuth, async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const userId = req.authUser!.id;
    const workId = String(req.body?.workId || '').trim();
    const shouldFavorite = Boolean(req.body?.favorite ?? req.body?.shouldFavorite ?? true);
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(workId)) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_WORK_ID',
        message: 'workId precisa ser um UUID válido.',
      });
      return;
    }

    try {
      if (shouldFavorite) {
        const { error } = await sb.from('favorites').upsert(
          {
            user_id: userId,
            work_id: workId,
          },
          { onConflict: 'user_id,work_id' }
        );
        if (error) {
          res.status(500).json({
            ok: false,
            code: error.code || 'SUPABASE_FAVORITE_UPSERT_ERROR',
            message: error.message,
          });
          return;
        }
      } else {
        const { error } = await sb
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('work_id', workId);
        if (error) {
          res.status(500).json({
            ok: false,
            code: error.code || 'SUPABASE_FAVORITE_DELETE_ERROR',
            message: error.message,
          });
          return;
        }
      }

      res.json({
        ok: true,
        workId,
        favorite: shouldFavorite,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_FAVORITE_SAVE_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao atualizar favorito do usuário.',
      });
    }
  });

  /**
   * FASE 6, FASE 7F & FASE 11 — CONSULTA DE PROGRESSO REAL DE LEITURA E AUDIOBOOK
   * (GET /api/reader/progress e GET /api/audio/progress)
   * Obtém `user.id` EXCLUSIVAMENTE da sessão autenticada (`req.authUser.id`).
   */
  const handleGetProgress: express.RequestHandler = async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const userId = req.authUser!.id;
    const workId = String(req.query.workId || '').trim();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    try {
      let query = sb
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)
        .order('last_accessed_at', { ascending: false });

      if (workId) {
        if (!uuidRegex.test(workId)) {
          res.json({
            ok: true,
            progress: null,
            records: [],
          });
          return;
        }
        query = query.eq('work_id', workId);
      }

      const { data, error } = await query;
      if (error) {
        res.status(500).json({
          ok: false,
          code: error.code || 'SUPABASE_PROGRESS_QUERY_ERROR',
          message: error.message,
        });
        return;
      }

      const records = Array.isArray(data) ? data : [];
      res.json({
        ok: true,
        progress: workId ? records[0] || null : undefined,
        records,
      });
    } catch (err) {
      console.error('[CRT Progress] Erro ao consultar user_progress:', err);
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_PROGRESS_QUERY_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao consultar progresso do usuário.',
      });
    }
  };

  app.get('/api/reader/progress', requireSupabaseAuth, handleGetProgress);
  app.get('/api/audio/progress', requireSupabaseAuth, handleGetProgress);

  /**
   * FASE 6, FASE 7F & FASE 11 — PERSISTÊNCIA REAL DE PROGRESSO DE LEITURA E AUDIOBOOK
   * (POST /api/reader/progress e POST /api/audio/progress)
   * Obtém `user.id` EXCLUSIVAMENTE da sessão autenticada (`req.authUser.id`).
   * Cria ou atualiza um único registro por (user_id + work_id) na tabela `user_progress`
   * do Supabase sem duplicar linhas.
   */
  const handlePostProgress: express.RequestHandler = async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const userId = req.authUser!.id;
    const workId = String(req.body?.workId || '').trim();
    const rawAssetId = String(req.body?.assetId || '').trim();
    const assetId = uuidRegex.test(rawAssetId) ? rawAssetId : null;
    const progressType =
      req.body?.progressType === 'listening' ? 'listening' : 'reading';

    const rawPositionInput =
      req.body?.position ?? req.body?.currentTime ?? req.body?.currentPage;
    const position =
      progressType === 'listening'
        ? Math.max(0, Math.floor(Number(rawPositionInput) || 0))
        : Math.max(1, Math.floor(Number(rawPositionInput) || 1));

    const totalUnits = Math.max(
      0,
      Math.floor(
        Number(req.body?.durationSeconds ?? req.body?.totalPages) || 0
      )
    );

    let progressPercent = Number(req.body?.progressPercent);
    if (!Number.isFinite(progressPercent) || progressPercent < 0) {
      if (totalUnits > 0) {
        const rawPct = (position / totalUnits) * 100;
        progressPercent =
          progressType === 'listening' && position > 0
            ? Math.max(1, Math.round(rawPct))
            : Math.round(rawPct);
      } else {
        progressPercent = 0;
      }
    } else if (
      progressType === 'listening' &&
      position > 0 &&
      progressPercent === 0 &&
      totalUnits > 0
    ) {
      progressPercent = Math.max(1, Math.round((position / totalUnits) * 100));
    }
    progressPercent = Math.min(100, Math.max(0, Math.round(progressPercent)));

    const completed =
      typeof req.body?.completed === 'boolean'
        ? req.body.completed
        : progressType === 'listening'
        ? totalUnits > 0
          ? position >= totalUnits - 5
          : progressPercent >= 100
        : totalUnits > 0
        ? position >= totalUnits
        : progressPercent >= 100;

    if (completed) {
      progressPercent = 100;
    }

    if (!uuidRegex.test(workId)) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_PROGRESS_IDENTIFIERS',
        message: 'workId precisa ser um UUID válido.',
      });
      return;
    }

    try {
      const nowIso = new Date().toISOString();

      // Verifica se já existe registro para este (user_id + work_id) para atualizar sem duplicar
      const { data: existingRows, error: findErr } = await sb
        .from('user_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('work_id', workId)
        .order('updated_at', { ascending: false });

      if (findErr) {
        res.status(500).json({
          ok: false,
          code: findErr.code || 'SUPABASE_PROGRESS_FIND_ERROR',
          message: findErr.message,
        });
        return;
      }

      const existingPrimary =
        Array.isArray(existingRows) && existingRows.length > 0
          ? existingRows[0]
          : null;

      // Se por acaso houver duplicatas antigas, remove as excedentes mantendo apenas 1 registro por (user_id + work_id)
      if (Array.isArray(existingRows) && existingRows.length > 1) {
        const duplicateIds = existingRows.slice(1).map((r) => r.id);
        await sb.from('user_progress').delete().in('id', duplicateIds);
      }

      let savedRecord = null;

      if (existingPrimary?.id) {
        const updatePayload: Record<string, unknown> = {
          progress_type: progressType,
          progress_percent: progressPercent,
          position,
          completed,
          last_accessed_at: nowIso,
          updated_at: nowIso,
        };
        if (assetId) {
          updatePayload.asset_id = assetId;
        }

        const { data: updated, error: updateErr } = await sb
          .from('user_progress')
          .update(updatePayload)
          .eq('id', existingPrimary.id)
          .select('*')
          .single();

        if (updateErr) {
          res.status(500).json({
            ok: false,
            code: updateErr.code || 'SUPABASE_PROGRESS_UPDATE_ERROR',
            message: updateErr.message,
          });
          return;
        }
        savedRecord = updated;
      } else {
        const insertPayload: Record<string, unknown> = {
          user_id: userId,
          work_id: workId,
          asset_id: assetId,
          progress_type: progressType,
          progress_percent: progressPercent,
          position,
          completed,
          last_accessed_at: nowIso,
          updated_at: nowIso,
        };

        const { data: inserted, error: insertErr } = await sb
          .from('user_progress')
          .insert(insertPayload)
          .select('*')
          .single();

        if (insertErr) {
          res.status(500).json({
            ok: false,
            code: insertErr.code || 'SUPABASE_PROGRESS_INSERT_ERROR',
            message: insertErr.message,
          });
          return;
        }
        savedRecord = inserted;
      }

      // Sincroniza automaticamente o progresso da trilha (user_trails / user_trail_steps) no Supabase
      try {
        await getHydratedTrailsFromSupabase(sb, userId);
      } catch (trailSyncErr) {
        console.warn(
          '[CRT Trails Sync] Aviso ao sincronizar user_trails após progresso:',
          trailSyncErr
        );
      }

      res.json({
        ok: true,
        progress: savedRecord,
      });
    } catch (err) {
      console.error('[CRT Progress] Erro ao salvar user_progress:', err);
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_PROGRESS_SAVE_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro interno ao salvar progresso do usuário.',
      });
    }
  };

  app.post('/api/reader/progress', requireSupabaseAuth, handlePostProgress);
  app.post('/api/audio/progress', requireSupabaseAuth, handlePostProgress);

  /**
   * FASE 8B & FASE 11 — ENDPOINTS RELACIONAIS DE MINHA TRILHA NO SUPABASE
   * Protegidos por `requireSupabaseAuth`: obtêm `user.id` exclusivamente da sessão autenticada (`req.authUser.id`).
   */
  app.get('/api/trails', requireSupabaseAuth, async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const userId = req.authUser!.id;

    try {
      const payload = await getHydratedTrailsFromSupabase(sb, userId);
      res.json(payload);
    } catch (err) {
      console.error('[CRT Trails Backend] Erro em GET /api/trails:', err);
      res.status(500).json({
        ok: false,
        code: 'TRAILS_QUERY_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao carregar trilhas e etapas do Supabase.',
      });
    }
  });

  app.post('/api/trails/select', requireSupabaseAuth, async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const userId = req.authUser!.id;
    const trailId = String(
      req.body?.trailId || req.body?.trailSlug || ''
    ).trim();

    if (!trailId) {
      res.status(400).json({
        ok: false,
        code: 'MISSING_TRAIL_ID',
        message: 'Informe trailId ou trailSlug para selecionar a trilha.',
      });
      return;
    }

    try {
      const payload = await selectActiveTrailForUserInSupabase(
        sb,
        userId,
        trailId
      );
      res.json(payload);
    } catch (err) {
      console.error('[CRT Trails Backend] Erro em POST /api/trails/select:', err);
      res.status(500).json({
        ok: false,
        code: 'TRAIL_SELECT_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao selecionar e salvar trilha ativa no Supabase.',
      });
    }
  });

  app.post('/api/trails/seed', requireSupabaseAuth, async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const userId = req.authUser!.id;

    try {
      const payload = await getHydratedTrailsFromSupabase(sb, userId);
      res.json(payload);
    } catch (err) {
      console.error('[CRT Trails Backend] Erro em POST /api/trails/seed:', err);
      res.status(500).json({
        ok: false,
        code: 'TRAIL_SEED_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao inicializar trilhas no Supabase.',
      });
    }
  });

  app.get('/api/trails/:idOrSlug', requireSupabaseAuth, async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_CLIENT_NOT_AVAILABLE',
        message: 'Cliente Supabase de servidor não disponível.',
      });
      return;
    }

    const idOrSlug = String(req.params.idOrSlug || '').trim();
    const userId = req.authUser!.id;

    try {
      const payload = await getHydratedTrailsFromSupabase(sb, userId);
      const trail = payload.trails.find(
        (t) =>
          t.id === idOrSlug ||
          t.slug.toLowerCase() === idOrSlug.toLowerCase()
      );
      if (!trail) {
        res.status(404).json({
          ok: false,
          code: 'TRAIL_NOT_FOUND',
          message: 'Trilha não encontrada no Supabase.',
        });
        return;
      }

      res.json({
        ok: true,
        storageMode: payload.storageMode,
        userId: payload.userId,
        trail,
      });
    } catch (err) {
      console.error('[CRT Trails Backend] Erro em GET /api/trails/:idOrSlug:', err);
      res.status(500).json({
        ok: false,
        code: 'TRAIL_DETAIL_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Erro ao carregar detalhes da trilha no Supabase.',
      });
    }
  });

  /**
   * FASE 5 & FASE 12 — ENDPOINT SEGURO DO LEITOR DE PDF (GET /api/reader/pdf/:assetId)
   * - Exige autenticação Supabase JWT válida (`requireSupabaseAuth`).
   * - Verifica se o asset existe, pertence à obra solicitada e se o usuário tem autorização para acessá-lo.
   * - Respeita `status` e `rights_status` (bloqueia obras bloqueadas e obras pendentes em contexto público).
   * - Preserva suporte a requisições HTTP Range (`206 Partial Content`, `Content-Range`).
   * - NUNCA expõe `drive_file_id`, URLs do Google Drive ou credenciais ao navegador.
   */
  app.get(
    '/api/reader/pdf/:assetId',
    requireSupabaseAuth,
    async (req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'Configuração administrativa do Supabase ausente no servidor.',
        });
        return;
      }

      const serviceAccountJson = (
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
      ).trim();
      const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();

      if (!serviceAccountJson && !driveApiKey) {
        res.status(428).json({
          ok: false,
          code: 'DRIVE_CREDENTIAL_MISSING',
          message:
            'Credencial do Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON) ausente no servidor.',
        });
        return;
      }

      const assetId = String(req.params.assetId || '').trim();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(assetId)) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_ASSET_ID',
          message: 'O identificador do asset informado não é um UUID válido.',
        });
        return;
      }

      const requestedWorkId = String(
        req.headers['x-crt-work-id'] || req.query?.workId || ''
      ).trim();
      if (requestedWorkId && !uuidRegex.test(requestedWorkId)) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_WORK_ID',
          message: 'O identificador da obra informada não é um UUID válido.',
        });
        return;
      }

      try {
        // 1 & 2. Consultar o asset e a obra associada no Supabase
        const { data: assetRow, error: assetErr } = await sb
          .from('assets')
          .select(
            `
            id,
            work_id,
            asset_type,
            source_type,
            drive_file_id,
            mime_type,
            file_size,
            status,
            works (
              id,
              title,
              status,
              rights_status
            )
          `
          )
          .eq('id', assetId)
          .maybeSingle();

        if (assetErr) {
          res.status(500).json({
            ok: false,
            code: 'SUPABASE_ASSET_QUERY_ERROR',
            message: 'Erro ao consultar asset no Supabase.',
          });
          return;
        }

        // 3. Confirmar que o asset existe
        if (!assetRow) {
          res.status(404).json({
            ok: false,
            code: 'ASSET_NOT_FOUND',
            message: 'Asset não encontrado no acervo do CRT Books.',
          });
          return;
        }

        // 4. Confirmar asset_type = 'ebook', source_type = 'google_drive', mime_type = 'application/pdf'
        if (
          assetRow.asset_type !== 'ebook' ||
          assetRow.source_type !== 'google_drive' ||
          assetRow.mime_type !== 'application/pdf'
        ) {
          res.status(422).json({
            ok: false,
            code: 'UNSUPPORTED_READER_ASSET',
            message:
              'Este asset não é um ebook PDF compatível com o leitor integrado.',
          });
          return;
        }

        const workObj = Array.isArray(assetRow.works)
          ? assetRow.works[0]
          : assetRow.works;

        if (!workObj || !assetRow.work_id || workObj.id !== assetRow.work_id) {
          res.status(404).json({
            ok: false,
            code: 'WORK_NOT_FOUND',
            message: 'Obra associada ao asset não encontrada.',
          });
          return;
        }

        // Verificar se o asset pertence à obra solicitada pelo cliente
        if (
          requestedWorkId &&
          String(assetRow.work_id).toLowerCase() !==
            requestedWorkId.toLowerCase()
        ) {
          res.status(403).json({
            ok: false,
            code: 'ASSET_WORK_MISMATCH',
            message:
              'Acesso negado: o asset solicitado não pertence à obra informada.',
          });
          return;
        }

        // 5. Verificar autorização do usuário, status e rights_status da obra
        const accessDecision = await evaluateProtectedMediaAccess({
          req,
          sb,
          work: workObj,
          assetStatus: assetRow.status,
          authUser: req.authUser,
        });

        if (!accessDecision.allowed) {
          res.status(accessDecision.status).json({
            ok: false,
            code: accessDecision.code,
            message: accessDecision.message,
          });
          return;
        }

      // 5. Obter drive_file_id SOMENTE no servidor
      const driveFileId = String(assetRow.drive_file_id || '').trim();
      if (!driveFileId) {
        res.status(404).json({
          ok: false,
          code: 'DRIVE_FILE_ID_MISSING',
          message: 'Referência interna do arquivo não encontrada para este asset.',
        });
        return;
      }

      // 6 & 7. Autenticar com GOOGLE_SERVICE_ACCOUNT_JSON e solicitar files.get({ fileId, alt: 'media' })
      const driveUrl = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
      );
      driveUrl.searchParams.set('alt', 'media');
      driveUrl.searchParams.set('supportsAllDrives', 'true');

      const driveHeaders: Record<string, string> = {};
      if (serviceAccountJson) {
        const accessToken =
          await getServiceAccountAccessToken(serviceAccountJson);
        driveHeaders.Authorization = `Bearer ${accessToken}`;
      } else if (driveApiKey) {
        driveUrl.searchParams.set('key', driveApiKey);
      }

      // Preservar/suportar header HTTP Range e limitar chunks em ambiente serverless (Vercel <= 3.5 MB por resposta)
      const MAX_SERVERLESS_PDF_CHUNK = 3_670_016; // 3.5 MB
      const totalPdfSize = Number(assetRow.file_size) || 0;
      const incomingRange =
        typeof req.headers.range === 'string' ? req.headers.range.trim() : '';

      if (incomingRange && /^bytes=/i.test(incomingRange) && totalPdfSize > 0) {
        const rangeSpec = incomingRange
          .replace(/^bytes=/i, '')
          .split(',')[0]
          .trim();
        const [startPart, endPart] = rangeSpec.split('-');
        const parsedStart = startPart !== '' ? parseInt(startPart, 10) : 0;
        const parsedEnd =
          endPart !== undefined && endPart !== ''
            ? parseInt(endPart, 10)
            : totalPdfSize - 1;
        const safeStart = Math.max(0, Number.isNaN(parsedStart) ? 0 : parsedStart);
        let safeEnd = Math.min(
          totalPdfSize - 1,
          Number.isNaN(parsedEnd) ? totalPdfSize - 1 : parsedEnd
        );
        if (safeEnd - safeStart + 1 > MAX_SERVERLESS_PDF_CHUNK) {
          safeEnd = Math.min(
            totalPdfSize - 1,
            safeStart + MAX_SERVERLESS_PDF_CHUNK - 1
          );
        }
        driveHeaders.Range = `bytes=${safeStart}-${safeEnd}`;
      } else if (incomingRange) {
        driveHeaders.Range = incomingRange;
      } else if (
        process.env.VERCEL === '1' &&
        totalPdfSize > MAX_SERVERLESS_PDF_CHUNK
      ) {
        driveHeaders.Range = `bytes=0-${MAX_SERVERLESS_PDF_CHUNK - 1}`;
      }

      const driveResponse = await fetch(driveUrl.toString(), {
        method: 'GET',
        headers: driveHeaders,
      });

      if (!driveResponse.ok && driveResponse.status !== 206) {
        res.status(driveResponse.status).json({
          ok: false,
          code: 'DRIVE_MEDIA_FETCH_FAILED',
          message: `Não foi possível carregar o conteúdo do ebook no servidor (HTTP ${driveResponse.status}).`,
        });
        return;
      }

      // 8. Definir headers seguros e transmitir o PDF através do backend
      res.status(driveResponse.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');

      const contentLength = driveResponse.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      const contentRange = driveResponse.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      const arrayBuffer = await driveResponse.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);
      res.end(pdfBuffer);
    } catch (err) {
      console.error('[CRT PDF Reader Backend] Erro ao transmitir PDF:', err);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          code: 'INTERNAL_READER_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro interno ao processar leitura do PDF.',
        });
      }
    }
  });

  /**
   * FASE 7D & FASE 12 — ENDPOINT SEGURO DE STREAMING DE AUDIOBOOK COM HTTP RANGE (GET /api/audio/stream/:assetId)
   * - Exige autenticação Supabase JWT válida (`requireSupabaseAuth`).
   * - Verifica se o asset existe, pertence à obra solicitada e se o usuário tem autorização para acessá-lo,
   *   inclusive em todas as requisições parciais HTTP Range.
   * - Respeita `status` e `rights_status` (bloqueia obras bloqueadas e obras pendentes em contexto público).
   * - Preserva integralmente HTTP 206 Partial Content, Content-Range e retomada do áudio.
   * - NUNCA expõe `drive_file_id`, URLs do Google Drive ou credenciais ao navegador.
   */
  app.get(
    '/api/audio/stream/:assetId',
    requireSupabaseAuth,
    async (req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'Configuração administrativa do Supabase ausente no servidor.',
        });
        return;
      }

      const serviceAccountJson = (
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
      ).trim();
      const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();

      if (!serviceAccountJson && !driveApiKey) {
        res.status(428).json({
          ok: false,
          code: 'DRIVE_CREDENTIAL_MISSING',
          message:
            'Credencial do Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON) ausente no servidor.',
        });
        return;
      }

      const assetId = String(req.params.assetId || '').trim();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(assetId)) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_ASSET_ID',
          message: 'O identificador do asset informado não é um UUID válido.',
        });
        return;
      }

      const requestedWorkId = String(
        req.headers['x-crt-work-id'] || req.query?.workId || ''
      ).trim();
      if (requestedWorkId && !uuidRegex.test(requestedWorkId)) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_WORK_ID',
          message: 'O identificador da obra informada não é um UUID válido.',
        });
        return;
      }

      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      try {
        // 1 & 2. Consultar o asset e a obra associada no Supabase
        const { data: assetRow, error: assetErr } = await sb
          .from('assets')
          .select(
            `
            id,
            work_id,
            asset_type,
            source_type,
            drive_file_id,
            mime_type,
            file_size,
            duration_seconds,
            status,
            works (
              id,
              title,
              status,
              rights_status
            )
          `
          )
          .eq('id', assetId)
          .maybeSingle();

        if (assetErr) {
          res.status(500).json({
            ok: false,
            code: 'SUPABASE_ASSET_QUERY_ERROR',
            message: 'Erro ao consultar asset de áudio no Supabase.',
          });
          return;
        }

        // 3. Confirmar que o registro realmente existe
        if (!assetRow) {
          res.status(404).json({
            ok: false,
            code: 'ASSET_NOT_FOUND',
            message: 'Asset de áudio não encontrado no acervo do CRT Books.',
          });
          return;
        }

        // 4. Confirmar asset_type = 'audio', source_type = 'google_drive', mime_type MP3/M4A compatível
        const normalizedAudioMime = String(assetRow.mime_type || '')
          .trim()
          .toLowerCase();
        const isSupportedAudioMime =
          normalizedAudioMime === 'audio/mpeg' ||
          normalizedAudioMime === 'audio/mp4' ||
          normalizedAudioMime === 'audio/x-m4a' ||
          normalizedAudioMime === 'audio/m4a' ||
          normalizedAudioMime === 'audio/aac';

        if (
          assetRow.asset_type !== 'audio' ||
          assetRow.source_type !== 'google_drive' ||
          !isSupportedAudioMime
        ) {
          res.status(422).json({
            ok: false,
            code: 'UNSUPPORTED_AUDIO_ASSET',
            message:
              'Este asset não é um audiobook MP3/M4A compatível com o player integrado.',
          });
          return;
        }

        const workObj = Array.isArray(assetRow.works)
          ? assetRow.works[0]
          : assetRow.works;

        if (!workObj || !assetRow.work_id || workObj.id !== assetRow.work_id) {
          res.status(404).json({
            ok: false,
            code: 'WORK_NOT_FOUND',
            message: 'Obra associada ao asset de áudio não encontrada.',
          });
          return;
        }

        // Verificar se o asset pertence à obra solicitada pelo cliente
        if (
          requestedWorkId &&
          String(assetRow.work_id).toLowerCase() !==
            requestedWorkId.toLowerCase()
        ) {
          res.status(403).json({
            ok: false,
            code: 'ASSET_WORK_MISMATCH',
            message:
              'Acesso negado: o asset de áudio solicitado não pertence à obra informada.',
          });
          return;
        }

        // 5. Verificar autorização do usuário, status e rights_status da obra (inclusive nas requisições Range)
        const accessDecision = await evaluateProtectedMediaAccess({
          req,
          sb,
          work: workObj,
          assetStatus: assetRow.status,
          authUser: req.authUser,
        });

        if (!accessDecision.allowed) {
          res.status(accessDecision.status).json({
            ok: false,
            code: accessDecision.code,
            message: accessDecision.message,
          });
          return;
        }

      // 5. Obter drive_file_id SOMENTE no servidor
      const driveFileId = String(assetRow.drive_file_id || '').trim();
      if (!driveFileId) {
        res.status(404).json({
          ok: false,
          code: 'DRIVE_FILE_ID_MISSING',
          message: 'Referência interna do arquivo de áudio não encontrada.',
        });
        return;
      }

      // 6. Autenticar no Google Drive via Service Account
      const accessToken = serviceAccountJson
        ? await getServiceAccountAccessToken(serviceAccountJson)
        : null;

      let totalSize = Number(assetRow.file_size) || 0;
      if (totalSize <= 0) {
        const metaUrl = new URL(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
        );
        metaUrl.searchParams.set('fields', 'size');
        metaUrl.searchParams.set('supportsAllDrives', 'true');
        const metaHeaders: Record<string, string> = {};
        if (accessToken) {
          metaHeaders.Authorization = `Bearer ${accessToken}`;
        } else if (driveApiKey) {
          metaUrl.searchParams.set('key', driveApiKey);
        }
        const metaRes = await fetch(metaUrl.toString(), {
          method: 'GET',
          headers: metaHeaders,
          signal: abortController.signal,
        });
        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as { size?: string | number };
          totalSize = Number(metaJson?.size) || 0;
        }
      }

      if (totalSize <= 0) {
        res.status(500).json({
          ok: false,
          code: 'AUDIO_FILE_SIZE_UNKNOWN',
          message: 'Não foi possível determinar o tamanho total do audiobook.',
        });
        return;
      }

      // 7. Calcular start, end, chunkSize e totalSize para Range: bytes=start-end e Range: bytes=start-
      // Bloco padrão de 1 MB (1.048.576 bytes) e teto máximo de 3.5 MB por requisição parcial,
      // garantindo resposta rápida (HTTP 206) e respeitando o limite de 4.5 MB de funções serverless na Vercel.
      const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MB (bytes 0-1048575 = 1048576 bytes)
      const MAX_CHUNK_SIZE = 3_670_016; // 3.5 MB

      const incomingRange =
        typeof req.headers.range === 'string' ? req.headers.range.trim() : '';

      let start = 0;
      let end = Math.min(DEFAULT_CHUNK_SIZE - 1, totalSize - 1);

      if (incomingRange && /^bytes=/i.test(incomingRange)) {
        const rangeSpec = incomingRange
          .replace(/^bytes=/i, '')
          .split(',')[0]
          .trim();
        const [startPart, endPart] = rangeSpec.split('-');
        const parsedStart = startPart !== '' ? parseInt(startPart, 10) : NaN;
        const parsedEnd =
          endPart !== undefined && endPart !== '' ? parseInt(endPart, 10) : NaN;

        if (!Number.isNaN(parsedStart) && parsedStart >= 0) {
          start = parsedStart;
          if (!Number.isNaN(parsedEnd) && parsedEnd >= start) {
            // Range fechado: bytes=start-end
            end = Math.min(parsedEnd, totalSize - 1);
            if (end - start + 1 > MAX_CHUNK_SIZE) {
              end = Math.min(start + MAX_CHUNK_SIZE - 1, totalSize - 1);
            }
          } else {
            // Range aberto: bytes=start- (como bytes=0- enviado inicialmente pelo HTML5 Audio)
            end = Math.min(start + DEFAULT_CHUNK_SIZE - 1, totalSize - 1);
          }
        } else if (
          startPart === '' &&
          !Number.isNaN(parsedEnd) &&
          parsedEnd > 0
        ) {
          // Suffix range: bytes=-N
          const suffixLength = Math.min(parsedEnd, MAX_CHUNK_SIZE);
          start = Math.max(0, totalSize - suffixLength);
          end = totalSize - 1;
        }
      }

      if (start >= totalSize || start < 0 || end < start) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        res.end();
        return;
      }

      const chunkSize = end - start + 1;

      const driveUrl = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
      );
      driveUrl.searchParams.set('alt', 'media');
      driveUrl.searchParams.set('supportsAllDrives', 'true');

      const driveHeaders: Record<string, string> = {
        Range: `bytes=${start}-${end}`,
      };
      if (accessToken) {
        driveHeaders.Authorization = `Bearer ${accessToken}`;
      } else if (driveApiKey) {
        driveUrl.searchParams.set('key', driveApiKey);
      }

      const driveResponse = await fetch(driveUrl.toString(), {
        method: 'GET',
        headers: driveHeaders,
        signal: abortController.signal,
      });

      if (!driveResponse.ok && driveResponse.status !== 206) {
        res.status(driveResponse.status).json({
          ok: false,
          code: 'DRIVE_AUDIO_FETCH_FAILED',
          message: `Não foi possível obter o trecho solicitado do audiobook (HTTP ${driveResponse.status}).`,
        });
        return;
      }

      const streamContentType =
        normalizedAudioMime.includes('m4a') ||
        normalizedAudioMime.includes('mp4')
          ? 'audio/mp4'
          : 'audio/mpeg';

      // 8. Responder SEMPRE com HTTP 206 Partial Content e Content-Length exato do chunk
      res.status(206);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      res.setHeader('Content-Type', streamContentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Accel-Buffering', 'no');

      if (!driveResponse.body) {
        res.end();
        return;
      }

      // Stream direto do chunk (pipe) sem jamais alocar o arquivo inteiro de 301 MB em memória
      const nodeStream = Readable.fromWeb(
        driveResponse.body as import('stream/web').ReadableStream
      );

      nodeStream.on('error', (streamErr: NodeJS.ErrnoException) => {
        if (
          streamErr?.name === 'AbortError' ||
          streamErr?.code === 'ABORT_ERR' ||
          abortController.signal.aborted
        ) {
          return;
        }
        console.error(
          '[CRT Audio Stream Backend] Erro durante transmissão do chunk:',
          streamErr
        );
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy();
        }
      });

      nodeStream.pipe(res);
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }
      console.error(
        '[CRT Audio Stream Backend] Erro ao processar streaming de áudio:',
        err
      );
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          code: 'INTERNAL_AUDIO_STREAM_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro interno ao processar streaming do audiobook.',
        });
      }
    }
  });

  /**
   * Endpoint administrativo server-side para importar itens selecionados no Supabase.
   * Utiliza EXCLUSIVAMENTE SUPABASE_SERVICE_ROLE_KEY no servidor e exige administrador autenticado.
   */
  app.post(
    '/api/admin/drive/import',
    requireSupabaseAdmin,
    async (req, res) => {
    const sb = getAdminSupabaseClient();
    if (!sb) {
      res.status(428).json({
        ok: false,
        code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
        message:
          'A variável de servidor SUPABASE_SERVICE_ROLE_KEY ainda não está configurada nos Secrets do Google AI Studio.',
      });
      return;
    }

    const selectedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const summary = {
      importedCount: 0,
      skippedDuplicateCount: 0,
      createdWorksCount: 0,
      reusedWorksCount: 0,
      createdAuthorsCount: 0,
      importedTitles: [] as string[],
      errors: [] as Array<{ fileName: string; code?: string; message: string }>,
    };

    const slugify = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `obra-${Date.now()}`;

    for (const item of selectedItems) {
      try {
        const { data: existingAsset, error: checkErr } = await sb
          .from('assets')
          .select('id, work_id')
          .eq('drive_file_id', item.driveFileId)
          .maybeSingle();

        if (checkErr) {
          summary.errors.push({
            fileName: item.originalName,
            code: checkErr.code,
            message: checkErr.message,
          });
          continue;
        }

        if (existingAsset) {
          summary.skippedDuplicateCount++;
          continue;
        }

        let authorId: string | null = null;
        if (item.inferredAuthor) {
          const authorSlug = slugify(item.inferredAuthor);
          const { data: existingAuthor } = await sb
            .from('authors')
            .select('id')
            .eq('slug', authorSlug)
            .maybeSingle();

          if (existingAuthor?.id) {
            authorId = existingAuthor.id;
          } else {
            const { data: createdAuthor } = await sb
              .from('authors')
              .insert({
                name: item.inferredAuthor,
                slug: authorSlug,
              })
              .select('id')
              .single();
            if (createdAuthor?.id) {
              authorId = createdAuthor.id;
              summary.createdAuthorsCount++;
            }
          }
        }

        const normalizedTitle =
          (item.suggestedTitle || '').trim() || item.originalName;
        const slug = slugify(normalizedTitle);

        let workId: string | null = null;
        const { data: existingWork } = await sb
          .from('works')
          .select('id, slug')
          .eq('slug', slug)
          .maybeSingle();

        if (existingWork?.id) {
          workId = existingWork.id;
          summary.reusedWorksCount++;
        } else {
          const workPayload: Record<string, unknown> = {
            title: normalizedTitle,
            slug,
            language: 'pt-BR',
            status: 'draft',
            rights_status: 'pending',
          };
          if (authorId) {
            workPayload.author_id = authorId;
          }

          const { data: createdWork, error: createWorkErr } = await sb
            .from('works')
            .insert(workPayload)
            .select('id')
            .single();

          if (createWorkErr || !createdWork?.id) {
            summary.errors.push({
              fileName: item.originalName,
              code: createWorkErr?.code,
              message:
                createWorkErr?.message ||
                'Não foi possível criar registro na tabela works.',
            });
            continue;
          }

          workId = createdWork.id;
          summary.createdWorksCount++;
        }

        const isAudio =
          item.assetType === 'audiobook' || item.assetType === 'audio';
        const fileSizeNum = Number(item.fileSize) || 0;
        let durationSeconds: number | null =
          Number(item.durationSeconds) > 0
            ? Math.round(Number(item.durationSeconds))
            : null;

        if (isAudio && !durationSeconds && fileSizeNum > 0 && item.driveFileId) {
          try {
            const serviceAccountJson = (
              process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
            ).trim();
            if (serviceAccountJson) {
              const accessToken =
                await getServiceAccountAccessToken(serviceAccountJson);
              const probeUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.driveFileId)}?alt=media&supportsAllDrives=true`;
              const probeEnd = Math.min(262143, fileSizeNum - 1);
              const probeRes = await fetch(probeUrl, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Range: `bytes=0-${probeEnd}`,
                },
              });
              if (probeRes.ok || probeRes.status === 206) {
                const probeBuf = Buffer.from(await probeRes.arrayBuffer());
                let id3Size = 0;
                if (probeBuf.subarray(0, 3).toString('ascii') === 'ID3') {
                  id3Size =
                    (((probeBuf[6] & 0x7f) << 21) |
                      ((probeBuf[7] & 0x7f) << 14) |
                      ((probeBuf[8] & 0x7f) << 7) |
                      (probeBuf[9] & 0x7f)) +
                    10;
                }
                const tmpProbe = path.join(
                  os.tmpdir(),
                  `crt_probe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`
                );
                await fs.promises.writeFile(tmpProbe, probeBuf);
                try {
                  const { stdout } = await execFileAsync('ffprobe', [
                    '-v',
                    'quiet',
                    '-print_format',
                    'json',
                    '-show_format',
                    '-show_streams',
                    tmpProbe,
                  ]);
                  const info = JSON.parse(stdout);
                  const audioStream = (info.streams || []).find(
                    (s: { codec_type?: string }) => s.codec_type === 'audio'
                  );
                  const bitRate = Number(
                    audioStream?.bit_rate || info.format?.bit_rate || 0
                  );
                  if (bitRate > 0) {
                    const audioBytes = Math.max(0, fileSizeNum - id3Size);
                    durationSeconds = Math.round((audioBytes * 8) / bitRate);
                  }
                } finally {
                  if (fs.existsSync(tmpProbe)) {
                    await fs.promises.unlink(tmpProbe).catch(() => {});
                  }
                }
              }
            }
          } catch {
            // Optional probe fallback
          }
        }

        const { error: createAssetErr } = await sb.from('assets').insert({
          work_id: workId,
          asset_type: isAudio ? 'audio' : 'ebook',
          source_type: 'google_drive',
          drive_file_id: item.driveFileId,
          mime_type: item.mimeType,
          file_size: fileSizeNum,
          duration_seconds: durationSeconds,
          checksum: item.checksum || null,
          status: 'pending',
        });

        if (createAssetErr) {
          summary.errors.push({
            fileName: item.originalName,
            code: createAssetErr.code,
            message: createAssetErr.message,
          });
          continue;
        }

        summary.importedCount++;
        summary.importedTitles.push(normalizedTitle);
      } catch (err) {
        summary.errors.push({
          fileName: item.originalName,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.json({
      ok: true,
      summary,
    });
  });

  /**
   * FASE 16 — CONSULTA E EXECUÇÃO DA IMPORTAÇÃO EM LOTE DO CATÁLOGO PRINCIPAL (250 Ebooks + 225 Audiobooks = 475 Obras)
   * Protegida por `requireSupabaseAdmin`:
   * - Nunca expõe credenciais privadas ao frontend;
   * - Preserva os 10 registros existentes e previne duplicações;
   * - Mantém todas as obras com direitos pendentes em modo privado/restrito (draft / pending).
   */
  app.get(
    '/api/admin/drive/batch-import/status',
    requireSupabaseAdmin,
    async (_req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'Configuração administrativa do Supabase ausente no servidor.',
        });
        return;
      }

      try {
        const [report, { data: works }, { data: assets }] = await Promise.all([
          loadLatestBatchImportReport(sb),
          sb.from('works').select('id').range(0, 4999),
          sb.from('assets').select('id, asset_type').range(0, 4999),
        ]);

        const worksArr = Array.isArray(works) ? works : [];
        const assetsArr = Array.isArray(assets) ? assets : [];

        res.json({
          ok: true,
          currentCatalog: {
            worksCount: worksArr.length,
            ebooksCount: assetsArr.filter((a) => a.asset_type === 'ebook')
              .length,
            audiobooksCount: assetsArr.filter((a) => a.asset_type === 'audio')
              .length,
          },
          latestReport: report,
        });
      } catch (err) {
        res.status(500).json({
          ok: false,
          code: 'BATCH_STATUS_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro ao consultar status da importação em lote.',
        });
      }
    }
  );

  app.post(
    '/api/admin/drive/batch-import/run',
    requireSupabaseAdmin,
    async (req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'Configuração administrativa do Supabase ausente no servidor.',
        });
        return;
      }

      const serviceAccountJson = (
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
      ).trim();
      const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();

      if (!serviceAccountJson && !driveApiKey) {
        res.status(428).json({
          ok: false,
          code: 'DRIVE_CREDENTIAL_MISSING',
          message:
            'Credencial do Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON) ausente no servidor.',
        });
        return;
      }

      try {
        const accessToken = serviceAccountJson
          ? await getServiceAccountAccessToken(serviceAccountJson)
          : null;

        const report = await executePhase16BatchCatalogImport({
          sb,
          accessToken,
          apiKey: driveApiKey,
          batchSize: Number(req.body?.batchSize) || 50,
          targetEbooks: Number(req.body?.targetEbooks) || 250,
          targetAudiobooks: Number(req.body?.targetAudiobooks) || 225,
        });

        res.json({
          ok: true,
          report,
        });
      } catch (err) {
        console.error(
          '[CRT Batch Importer] Erro em POST /api/admin/drive/batch-import/run:',
          err
        );
        res.status(500).json({
          ok: false,
          code: 'BATCH_IMPORT_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro interno ao executar importação em lote.',
        });
      }
    }
  );

  /**
  /**
   * FASE 17 — CAPAS AUTOMÁTICAS DOS 250 EBOOKS E 225 AUDIOBOOKS (BACKEND EXCLUSIVO)
   * - Identifica obras sem capa válida no Supabase;
   * - Para PDFs: extrai a página 1 quando for realmente uma capa (rejeitando páginas de texto/sumário);
   * - Para Audiobooks MP3/M4A: prioriza imagens incorporadas nos metadados ou capas associadas no Google Drive;
   * - Para obras sem capa extraível: gera capa gráfica substituta WebP 2:3 (600x900) com título e autor reais e identidade CRT Books;
   * - Armazena no Supabase Storage (`book-covers`) e vincula `works.cover_url`.
   */
  app.get(
    '/api/admin/covers/status',
    requireSupabaseAdmin,
    async (_req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'A variável de servidor SUPABASE_SERVICE_ROLE_KEY não está configurada.',
        });
        return;
      }

      try {
        const [report, { data: works }] = await Promise.all([
          loadLatestCoverBatchReport(sb),
          sb.from('works').select('id, cover_url').range(0, 4999),
        ]);

        const worksArr = Array.isArray(works) ? works : [];
        const withValidCover = worksArr.filter((w) => {
          const u = w.cover_url ? String(w.cover_url).trim() : '';
          return u.startsWith('https://') && u.includes(`/${BOOK_COVERS_BUCKET}/`);
        }).length;

        res.json({
          ok: true,
          totalWorks: worksArr.length,
          withValidCoverCount: withValidCover,
          missingCoverCount: Math.max(0, worksArr.length - withValidCover),
          latestReport: report,
        });
      } catch (err) {
        res.status(500).json({
          ok: false,
          code: 'COVERS_STATUS_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro ao consultar status das capas.',
        });
      }
    }
  );

  app.post(
    '/api/admin/covers/generate',
    requireSupabaseAdmin,
    async (req, res) => {
      const sb = getAdminSupabaseClient();
      if (!sb) {
        res.status(428).json({
          ok: false,
          code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING',
          message:
            'A variável de servidor SUPABASE_SERVICE_ROLE_KEY não está configurada.',
        });
        return;
      }

      const serviceAccountJson = (
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
      ).trim();
      const driveApiKey = (process.env.GOOGLE_DRIVE_API_KEY || '').trim();

      if (!serviceAccountJson && !driveApiKey) {
        res.status(428).json({
          ok: false,
          code: 'DRIVE_CREDENTIAL_MISSING',
          message:
            'Credencial do Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON) não configurada no servidor.',
        });
        return;
      }

      try {
        const accessToken = serviceAccountJson
          ? await getServiceAccountAccessToken(serviceAccountJson)
          : null;

        const report = await executePhase17BatchCoversProcess({
          sb,
          accessToken,
          apiKey: driveApiKey,
          forceRegenerate: Boolean(req.body?.force),
          concurrency: Number(req.body?.concurrency) || 15,
        });

        res.json({
          ok: true,
          report,
        });
      } catch (err) {
        console.error(
          '[CRT Cover Generator] Erro ao processar capas em lote (Fase 17):',
          err
        );
        res.status(500).json({
          ok: false,
          code: 'COVER_GENERATION_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Erro inesperado ao processar geração de capas em lote.',
        });
      }
    }
  );

  return app;
}

export const app = createApp();

async function startServer() {
  // O ambiente de desenvolvimento do AI Studio exige estritamente a porta 3000.
  // No container do AI Studio, process.env.PORT=8080 pertence ao proxy reverso de borda.
  const PORT =
    process.env.NODE_ENV === 'production' &&
    process.env.PORT &&
    process.env.PORT !== '8080'
      ? Number(process.env.PORT)
      : 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CRT BOOKS server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('[CRT Server] Erro no listener do servidor Express:', err);
  });
}

if (process.env.VERCEL !== '1' && process.env.CRT_SERVERLESS !== 'true') {
  startServer().catch((err) => {
    console.error('[CRT Server] Falha fatal ao inicializar startServer:', err);
  });
}

export default app;
