/**
 * CRT BOOKS — SERVICE WORKER DE CACHE SEGURO (FASE 15)
 *
 * REGRAS DE SEGURANÇA E PRIVACIDADE:
 * 1. NUNCA armazena em cache rotas de API (/api/*), PDFs (/api/reader/pdf/*),
 *    streams de áudio (/api/audio/stream/*), requisições HTTP Range, tokens,
 *    respostas privadas do Supabase ou do Google Drive.
 * 2. NUNCA permite que o modo offline contorne autenticação ou assinatura.
 * 3. Armazena APENAS arquivos estáticos públicos do shell da aplicação
 *    (HTML inicial, JS/CSS estáticos de build, ícones PWA e fontes).
 * 4. Permite limpeza imediata de cache ao sair da conta (mensagem CRT_CLEAR_SENSITIVE_CACHES).
 */

const STATIC_CACHE_NAME = 'crt-books-static-v15';
const FONTS_CACHE_NAME = 'crt-books-fonts-v15';
const ALLOWED_CACHES = new Set([STATIC_CACHE_NAME, FONTS_CACHE_NAME]);

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-192x192.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

const STATIC_EXTENSIONS_REGEX =
  /\.(?:js|css|woff2?|ttf|otf|svg|png|ico|webp|webmanifest)$/i;

/**
 * Verifica se uma requisição é estritamente proibida de entrar no cache.
 */
function isStrictlyNeverCacheRequest(request, url) {
  // 1. Apenas método GET pode ser avaliado para cache
  if (request.method !== 'GET') {
    return true;
  }

  // 2. Qualquer rota de backend (/api/*) é estritamente proibida no cache
  if (url.pathname.startsWith('/api/')) {
    return true;
  }

  // 3. Domínios externos de banco/autenticação/arquivos (Supabase, Google APIs) nunca entram no cache
  const host = url.hostname.toLowerCase();
  if (
    host.endsWith('.supabase.co') ||
    host.endsWith('.supabase.in') ||
    host.includes('googleapis.com') ||
    host.includes('googleusercontent.com') ||
    host.includes('drive.google.com')
  ) {
    return true;
  }

  // 4. Requisições com cabeçalho Authorization ou Range (streaming de mídia) nunca entram no cache
  if (
    request.headers.has('authorization') ||
    request.headers.has('range') ||
    request.headers.has('x-crt-work-id')
  ) {
    return true;
  }

  // 5. Extensões de livros/audiolivros nunca entram no cache do SW
  if (/\.(?:pdf|epub|mp3|m4a|wav|aac|ogg)$/i.test(url.pathname)) {
    return true;
  }

  // 6. Query strings com tokens ou códigos de sessão nunca entram no cache
  if (
    url.searchParams.has('token') ||
    url.searchParams.has('access_token') ||
    url.searchParams.has('refresh_token') ||
    url.searchParams.has('code')
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se a resposta recebida é segura e pública para cache estático.
 */
function isSafeStaticResponse(response) {
  if (!response || response.status !== 200) {
    return false;
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (
    contentType.includes('application/pdf') ||
    contentType.includes('application/epub') ||
    contentType.includes('audio/') ||
    contentType.includes('video/') ||
    contentType.includes('application/json')
  ) {
    return false;
  }

  const cacheControl = (
    response.headers.get('cache-control') || ''
  ).toLowerCase();
  if (
    cacheControl.includes('no-store') ||
    cacheControl.includes('private')
  ) {
    return false;
  }

  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            fetch(url, { credentials: 'omit', cache: 'reload' }).then((res) => {
              if (res.ok && res.status === 200) {
                return cache.put(url, res);
              }
              return undefined;
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!ALLOWED_CACHES.has(key)) {
              return caches.delete(key);
            }
            return undefined;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CRT_CLEAR_SENSITIVE_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys.map(async (key) => {
            const cache = await caches.open(key);
            const requests = await cache.keys();
            await Promise.all(
              requests.map((req) => {
                const reqUrl = new URL(req.url);
                if (isStrictlyNeverCacheRequest(req, reqUrl)) {
                  return cache.delete(req);
                }
                return undefined;
              })
            );
          })
        )
      )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Ignora protocolos não HTTP/HTTPS (ex: chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // REGRA CRÍTICA: Nunca interceptar ou armazenar rotas privadas, PDFs, áudios, Range ou tokens
  if (isStrictlyNeverCacheRequest(request, url)) {
    return;
  }

  // 1. Fontes do Google Fonts (CacheFirst seguro)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(FONTS_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const networkRes = await fetch(request);
          if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 2. Navegação SPA (HTML principal): NetworkFirst com fallback para o shell da aplicação
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (networkRes) => {
          if (isSafeStaticResponse(networkRes)) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put('/index.html', networkRes.clone());
          }
          return networkRes;
        })
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const cachedShell =
            (await cache.match('/index.html')) || (await cache.match('/'));
          if (cachedShell) {
            return cachedShell;
          }
          return new Response(
            '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRT Books — Sem conexão</title><style>body{margin:0;background:#07090E;color:#F8FAFC;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.card{max-width:400px;background:#0E131F;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px}h1{font-size:20px;margin:0 0 10px;color:#fff}p{font-size:14px;color:#94A3B8;line-height:1.5;margin:0 0 20px}button{background:#22D3EE;color:#07090E;border:none;border-radius:12px;padding:12px 24px;font-weight:700;cursor:pointer}</style></head><body><div class="card"><h1>Você está sem conexão</h1><p>Conecte-se à internet para autenticar sua conta e acessar seus livros e audiolivros no CRT Books.</p><button onclick="window.location.reload()">Tentar novamente</button></div></body></html>',
            {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          );
        })
    );
    return;
  }

  // 3. Arquivos estáticos públicos do próprio domínio (JS, CSS, SVG, PNG, WebManifest)
  if (
    url.origin === self.location.origin &&
    STATIC_EXTENSIONS_REGEX.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(async (cache) => {
        try {
          const networkRes = await fetch(request);
          if (isSafeStaticResponse(networkRes)) {
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        } catch {
          const cached = await cache.match(request);
          return cached || Response.error();
        }
      })
    );
  }
});
