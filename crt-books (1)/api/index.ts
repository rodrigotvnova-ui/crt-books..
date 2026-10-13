import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../server';

/**
 * FASE 18 — Handler Serverless da Vercel para o Backend do CRT Books.
 * Encaminha todas as requisições de `/api/*` para a instância Express (`app`)
 * sem iniciar `app.listen()` ou middleware do Vite em ambiente serverless.
 */
export default function handler(
  req: IncomingMessage & { url?: string },
  res: ServerResponse
) {
  if (
    req.url &&
    !req.url.startsWith('/api/') &&
    req.url !== '/api' &&
    !req.url.startsWith('/manifest') &&
    req.url !== '/sw.js'
  ) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  return app(req, res);
}
