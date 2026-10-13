import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import {
  fetchReadingProgressForWork,
  saveReadingPageProgress,
} from '../services/database';
import {
  getSupabaseAuthHeaders,
  syncServerAuthSessionCookie,
} from '../services/supabase';
import { OfflineTopBanner } from '../components/OfflineExperience';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { AuthenticatedUser, Work } from '../types/models';

// Configura o Web Worker do PDF.js empacotado localmente pelo Vite (sem CDN externa)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    pdfjsWorkerUrl,
    window.location.origin
  ).toString();
}

const ZOOM_STEPS = [50, 75, 90, 100, 115, 125, 150, 175, 200] as const;
const DEFAULT_ZOOM_PERCENT = 100;

interface PdfReaderScreenProps {
  work: Work | null;
  user?: AuthenticatedUser | null;
  isLoadingWork?: boolean;
  onBack: () => void;
  onProgressUpdated?: (
    workId: string,
    currentPage: number,
    totalPages: number,
    progressPercent: number,
    completed: boolean
  ) => void;
}

export const PdfReaderScreen: React.FC<PdfReaderScreenProps> = ({
  work,
  user = null,
  isLoadingWork = false,
  onBack,
  onProgressUpdated,
}) => {
  const [isLoadingDocument, setIsLoadingDocument] = useState<boolean>(false);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(() =>
    work?.position && work.position >= 1 ? Math.floor(work.position) : 1
  );
  const [zoomPercent, setZoomPercent] = useState<number>(DEFAULT_ZOOM_PERCENT);
  const [docReadyVersion, setDocReadyVersion] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const { isOnline, checkingConnection, verifyConnectionNow } =
    useNetworkStatus();

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const docLoadGenerationRef = useRef<number>(0);
  const pageRenderGenerationRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const saveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const latestStateRef = useRef<{
    work: Work | null;
    user: AuthenticatedUser | null;
    assetId: string | null;
    currentPage: number;
    numPages: number;
  }>({
    work,
    user,
    assetId: null,
    currentPage: 1,
    numPages: 0,
  });

  const pdfAsset = work?.assets.find(
    (a) => a.format === 'ebook' && a.mimeType === 'application/pdf'
  );
  const assetId = pdfAsset?.id || null;

  useEffect(() => {
    latestStateRef.current = {
      work,
      user,
      assetId,
      currentPage,
      numPages,
    };
  }, [work, user, assetId, currentPage, numPages]);

  const persistProgressSnapshot = useCallback(
    async (pageToSave: number, totalToSave: number) => {
      const currentWork = latestStateRef.current.work;
      const currentUser = latestStateRef.current.user;
      const currentAssetId = latestStateRef.current.assetId;

      if (!currentWork || totalToSave < 1) return;

      const safeTotal = Math.max(1, Math.floor(totalToSave));
      const safePage = Math.min(Math.max(1, Math.floor(pageToSave)), safeTotal);
      const completed = safePage >= safeTotal;
      const progressPercent = completed
        ? 100
        : Math.min(100, Math.max(1, Math.round((safePage / safeTotal) * 100)));

      if (onProgressUpdated) {
        onProgressUpdated(
          currentWork.id,
          safePage,
          safeTotal,
          progressPercent,
          completed
        );
      }

      if (currentUser && currentAssetId) {
        try {
          await saveReadingPageProgress(
            currentUser,
            currentWork,
            currentAssetId,
            safePage,
            safeTotal
          );
        } catch (err) {
          console.error(
            '[CRT PDF.js Reader] Erro ao persistir progresso de leitura:',
            err
          );
        }
      }
    },
    [onProgressUpdated]
  );

  // Observa a largura disponível do container para ajustar automaticamente no celular e desktop
  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const nextWidth = el.clientWidth;
      if (nextWidth > 0) {
        setContainerWidth(nextWidth);
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, [isLoadingDocument, errorMessage, docReadyVersion]);

  const cleanupPdfResources = useCallback(async () => {
    pageRenderGenerationRef.current += 1;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignora erro de cancelamento
      }
      renderTaskRef.current = null;
    }

    if (pdfDocRef.current) {
      try {
        await pdfDocRef.current.cleanup();
      } catch {
        // ignora erro de cleanup
      }
      pdfDocRef.current = null;
    }

    if (loadingTaskRef.current) {
      try {
        await loadingTaskRef.current.destroy();
      } catch {
        // ignora erro de destroy
      }
      loadingTaskRef.current = null;
    }
  }, []);

  const loadPdfDocument = useCallback(async () => {
    if (!work) return;

    if (!assetId) {
      console.error(
        '[CRT PDF.js Reader] Nenhum asset PDF encontrado para a obra:',
        work.id
      );
      setErrorMessage('Não foi possível carregar este livro.');
      return;
    }

    const currentDocGen = ++docLoadGenerationRef.current;

    setIsLoadingDocument(true);
    setErrorMessage(null);
    setNumPages(0);

    await cleanupPdfResources();

    if (currentDocGen !== docLoadGenerationRef.current) {
      return;
    }

    try {
      await syncServerAuthSessionCookie();
      const pdfHeaders = await getSupabaseAuthHeaders({
        Accept: 'application/pdf',
        'X-CRT-Work-Id': work.id,
      });

      // Buscar em paralelo o PDF via backend autenticado e o progresso salvo do usuário no Supabase
      const [response, savedProg] = await Promise.all([
        fetch(`/api/reader/pdf/${encodeURIComponent(assetId)}`, {
          method: 'GET',
          headers: pdfHeaders,
          credentials: 'same-origin',
        }),
        fetchReadingProgressForWork(user, work.id).catch(() => null),
      ]);

      if (!response.ok) {
        let technicalDetail = `HTTP ${response.status}`;
        try {
          const errJson = (await response.json()) as {
            code?: string;
            message?: string;
          };
          if (errJson?.message || errJson?.code) {
            technicalDetail = `${errJson.code || 'ERROR'}: ${errJson.message || ''}`;
          }
        } catch {
          // ignora falha de parse JSON
        }
        throw new Error(
          `Falha no endpoint /api/reader/pdf/${assetId} (${technicalDetail})`
        );
      }

      const firstChunkBuf = await response.arrayBuffer();
      if (!firstChunkBuf || firstChunkBuf.byteLength === 0) {
        throw new Error('O ArrayBuffer retornado pelo endpoint está vazio.');
      }

      if (currentDocGen !== docLoadGenerationRef.current) {
        return;
      }

      let pdfBytes = new Uint8Array(firstChunkBuf);

      // Se o backend serverless (Vercel) respondeu com 206 Partial Content para PDF > 3.5 MB, busca os chunks restantes via HTTP Range
      const contentRangeHeader = response.headers.get('content-range') || '';
      const rangeMatch = contentRangeHeader.match(
        /bytes\s+(\d+)-(\d+)\/(\d+)/i
      );
      if (response.status === 206 && rangeMatch) {
        const totalSize = parseInt(rangeMatch[3], 10);
        let nextStart = parseInt(rangeMatch[2], 10) + 1;
        const CHUNK_STEP = 3_670_016; // 3.5 MB

        if (totalSize > pdfBytes.byteLength) {
          const fullPdfBytes = new Uint8Array(totalSize);
          fullPdfBytes.set(pdfBytes, 0);

          while (nextStart < totalSize) {
            if (currentDocGen !== docLoadGenerationRef.current) {
              return;
            }
            const nextEnd = Math.min(totalSize - 1, nextStart + CHUNK_STEP - 1);
            const chunkRes = await fetch(
              `/api/reader/pdf/${encodeURIComponent(assetId)}`,
              {
                method: 'GET',
                headers: {
                  ...pdfHeaders,
                  Range: `bytes=${nextStart}-${nextEnd}`,
                },
                credentials: 'same-origin',
              }
            );
            if (!chunkRes.ok && chunkRes.status !== 206) {
              throw new Error(
                `Falha ao carregar bloco do PDF (${nextStart}-${nextEnd}): HTTP ${chunkRes.status}`
              );
            }
            const chunkAb = await chunkRes.arrayBuffer();
            const chunkArr = new Uint8Array(chunkAb);
            if (chunkArr.byteLength === 0) break;
            fullPdfBytes.set(chunkArr, nextStart);
            nextStart += chunkArr.byteLength;
          }

          pdfBytes = fullPdfBytes;
        }
      }

      const loadingTask = pdfjsLib.getDocument({
        data: pdfBytes,
      });
      loadingTaskRef.current = loadingTask;

      const pdfDoc = await loadingTask.promise;

      if (currentDocGen !== docLoadGenerationRef.current) {
        await loadingTask.destroy();
        return;
      }

      if (!pdfDoc || pdfDoc.numPages < 1) {
        throw new Error('Documento PDF sem páginas válidas.');
      }

      const total = pdfDoc.numPages;
      const candidateSavedPage =
        savedProg?.currentPage && savedProg.currentPage >= 1
          ? savedProg.currentPage
          : work.position && work.position >= 1
          ? work.position
          : 1;
      const restoredPage = Math.min(
        Math.max(1, Math.floor(candidateSavedPage)),
        total
      );

      pdfDocRef.current = pdfDoc;
      setNumPages(total);
      setCurrentPage(restoredPage);
      setZoomPercent(DEFAULT_ZOOM_PERCENT);
      setDocReadyVersion((v) => v + 1);
    } catch (err) {
      if (currentDocGen !== docLoadGenerationRef.current) {
        return;
      }
      console.error(
        '[CRT PDF.js Reader] Erro técnico ao carregar documento PDF:',
        err
      );
      setErrorMessage('Não foi possível carregar este livro.');
    } finally {
      if (currentDocGen === docLoadGenerationRef.current) {
        setIsLoadingDocument(false);
      }
    }
  }, [work, user, assetId, cleanupPdfResources]);

  // Carrega o documento uma única vez por assetId
  useEffect(() => {
    if (!work) return;
    loadPdfDocument();

    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
      const snap = latestStateRef.current;
      if (snap.work && snap.numPages > 0 && snap.currentPage >= 1) {
        persistProgressSnapshot(snap.currentPage, snap.numPages);
      }
      docLoadGenerationRef.current += 1;
      cleanupPdfResources();
    };
  }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salva automaticamente (com debounce curto de 350ms) ao abrir/mudar de página
  useEffect(() => {
    if (
      isLoadingDocument ||
      errorMessage ||
      numPages < 1 ||
      currentPage < 1 ||
      !work
    ) {
      return;
    }

    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }

    saveDebounceTimerRef.current = setTimeout(() => {
      persistProgressSnapshot(currentPage, numPages);
    }, 350);

    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
      }
    };
  }, [
    currentPage,
    numPages,
    isLoadingDocument,
    errorMessage,
    work,
    persistProgressSnapshot,
  ]);

  // Renderiza SOMENTE a página atual no canvas com suporte a HiDPI (devicePixelRatio) e cancelamento seguro
  useEffect(() => {
    const pdfDoc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (
      isLoadingDocument ||
      errorMessage ||
      !pdfDoc ||
      !canvas ||
      numPages < 1
    ) {
      return;
    }

    let cancelled = false;
    const activePageGen = ++pageRenderGenerationRef.current;

    const renderSinglePage = async () => {
      setIsRenderingPage(true);

      // Se houver renderização anterior em andamento no mesmo canvas, cancela e aguarda finalizar
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
          await renderTaskRef.current.promise.catch(() => undefined);
        } catch {
          // cancelamento esperado
        }
        renderTaskRef.current = null;
      }

      if (cancelled || activePageGen !== pageRenderGenerationRef.current) {
        return;
      }

      try {
        const safePageNumber = Math.min(Math.max(1, currentPage), numPages);
        const page = await pdfDoc.getPage(safePageNumber);

        if (cancelled || activePageGen !== pageRenderGenerationRef.current) {
          return;
        }

        const unscaledViewport = page.getViewport({ scale: 1 });
        const rawAvailableWidth =
          containerWidth ||
          viewportContainerRef.current?.clientWidth ||
          window.innerWidth;

        // Desconta o padding interno para evitar barra de rolagem horizontal em 100%
        const horizontalPadding = rawAvailableWidth < 640 ? 20 : 48;
        const usableWidth = Math.max(240, rawAvailableWidth - horizontalPadding);
        const baseTargetWidth = Math.min(usableWidth, 760);

        const baseFitScale = baseTargetWidth / unscaledViewport.width;
        const effectiveScale = baseFitScale * (zoomPercent / 100);

        const viewport = page.getViewport({ scale: effectiveScale });
        const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);

        const pixelWidth = Math.floor(viewport.width * outputScale);
        const pixelHeight = Math.floor(viewport.height * outputScale);
        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('Contexto 2D do canvas indisponível.');
        }

        const transform =
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined;

        const renderTask = page.render({
          canvas: null,
          canvasContext: ctx,
          viewport,
          transform,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      } catch (err: unknown) {
        const errName =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name?: unknown }).name)
            : '';

        if (
          cancelled ||
          errName === 'RenderingCancelledException' ||
          activePageGen !== pageRenderGenerationRef.current
        ) {
          return;
        }

        console.error(
          `[CRT PDF.js Reader] Erro técnico ao renderizar página ${currentPage}:`,
          err
        );
        setErrorMessage('Não foi possível carregar este livro.');
      } finally {
        if (!cancelled && activePageGen === pageRenderGenerationRef.current) {
          setIsRenderingPage(false);
        }
      }
    };

    renderSinglePage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignora erro de cancelamento
        }
      }
    };
  }, [
    docReadyVersion,
    currentPage,
    zoomPercent,
    containerWidth,
    isLoadingDocument,
    errorMessage,
    numPages,
  ]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => {
      const next = Math.max(1, prev - 1);
      if (next !== prev) {
        viewportContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return next;
    });
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => {
      const next = Math.min(numPages || 1, prev + 1);
      if (next !== prev) {
        viewportContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return next;
    });
  }, [numPages]);

  const handleZoomOut = useCallback(() => {
    setZoomPercent((prev) => {
      const idx = ZOOM_STEPS.findIndex((z) => z >= prev);
      if (idx <= 0) return ZOOM_STEPS[0];
      return ZOOM_STEPS[idx - 1];
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomPercent((prev) => {
      const idx = ZOOM_STEPS.findIndex((z) => z >= prev);
      if (idx === -1 || idx >= ZOOM_STEPS.length - 1) {
        return ZOOM_STEPS[ZOOM_STEPS.length - 1];
      }
      return ZOOM_STEPS[idx + 1];
    });
  }, []);

  const handleExitReader = useCallback(async () => {
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
      saveDebounceTimerRef.current = null;
    }
    if (work && numPages > 0 && currentPage >= 1) {
      await persistProgressSnapshot(currentPage, numPages);
    }
    onBack();
  }, [work, numPages, currentPage, persistProgressSnapshot, onBack]);

  const progressPercent =
    numPages > 0
      ? currentPage >= numPages
        ? 100
        : Math.min(100, Math.max(1, Math.round((currentPage / numPages) * 100)))
      : 0;

  const canGoPrev = !isLoadingDocument && !errorMessage && currentPage > 1;
  const canGoNext =
    !isLoadingDocument && !errorMessage && numPages > 0 && currentPage < numPages;
  const canZoomOut =
    !isLoadingDocument && !errorMessage && zoomPercent > ZOOM_STEPS[0];
  const canZoomIn =
    !isLoadingDocument &&
    !errorMessage &&
    zoomPercent < ZOOM_STEPS[ZOOM_STEPS.length - 1];

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090E] text-[#F8FAFC] flex flex-col overflow-x-hidden">
      {/* Top Reader Header: ← Voltar | Título | Autor | Leitor CRT Books */}
      <header className="sticky top-0 z-30 bg-[#0B0F19]/95 backdrop-blur-xl border-b border-white/[0.08] safe-top">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={handleExitReader}
            className="inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl bg-[#0E131F] hover:bg-[#151D2E] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="flex-1 min-w-0 flex items-center justify-center sm:justify-start gap-2.5">
            {work?.cover && (
              <img
                src={work.cover}
                alt={`Capa de ${work.title}`}
                referrerPolicy="no-referrer"
                className="w-7 h-10 rounded-md object-cover border border-white/15 shrink-0"
              />
            )}
            <div className="min-w-0 text-center sm:text-left">
              <h1 className="text-xs sm:text-base font-display font-bold text-white truncate">
                {work?.title || 'Carregando livro...'}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                {work?.author || ''}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-cyan-400 font-medium shrink-0">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Leitor CRT Books</span>
          </div>
        </div>

        {/* Barra discreta de controles de Página e Zoom adaptada para celulares de 360px+ */}
        {!isLoadingWork && !isLoadingDocument && !errorMessage && numPages > 0 && (
          <div className="border-t border-white/[0.06] bg-[#090D16]/95">
            <div className="max-w-6xl mx-auto px-2.5 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
              {/* Navegação de Páginas */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  aria-label="Página anterior"
                  className="inline-flex items-center gap-1 min-h-[36px] px-2 sm:px-3 py-1.5 rounded-lg bg-[#0E131F] hover:bg-[#151D2E] disabled:opacity-40 disabled:pointer-events-none border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Página anterior</span>
                </button>

                <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] sm:text-xs font-medium text-slate-300 tabular-nums whitespace-nowrap">
                  Pág. {currentPage}/{numPages} ·{' '}
                  <strong className="text-cyan-400 font-semibold">
                    {progressPercent}%
                  </strong>
                </span>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  aria-label="Próxima página"
                  className="inline-flex items-center gap-1 min-h-[36px] px-2 sm:px-3 py-1.5 rounded-lg bg-[#0E131F] hover:bg-[#151D2E] disabled:opacity-40 disabled:pointer-events-none border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="hidden sm:inline">Próxima página</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Controles de Zoom */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                  aria-label="Zoom -"
                  title="Zoom -"
                  className="inline-flex items-center gap-1 min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#0E131F] hover:bg-[#151D2E] disabled:opacity-40 disabled:pointer-events-none border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Zoom -</span>
                </button>

                <span className="min-w-[46px] sm:min-w-[54px] text-center px-1.5 sm:px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] sm:text-xs font-semibold text-cyan-400 tabular-nums">
                  {zoomPercent}%
                </span>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                  aria-label="Zoom +"
                  title="Zoom +"
                  className="inline-flex items-center gap-1 min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#0E131F] hover:bg-[#151D2E] disabled:opacity-40 disabled:pointer-events-none border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Zoom +</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <OfflineTopBanner
          isOnline={isOnline}
          checkingConnection={checkingConnection}
          onRetryConnection={async () => {
            const online = await verifyConnectionNow();
            if (online && errorMessage) {
              loadPdfDocument();
            }
          }}
        />
      </header>

      {/* Main Reader Viewport */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-2 sm:px-6 py-3 sm:py-5 safe-bottom flex flex-col">
        {isLoadingWork || isLoadingDocument ? (
          <div className="flex-1 min-h-[75vh] rounded-2xl bg-[#0E131F]/80 border border-white/[0.08] flex flex-col items-center justify-center p-6 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
            <p className="text-sm sm:text-base font-display font-semibold text-white">
              Carregando livro...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="flex-1 min-h-[75vh] rounded-2xl bg-[#0E131F]/80 border border-white/[0.08] flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-base sm:text-lg font-display font-bold text-white">
                {errorMessage}
              </h2>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onBack}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                Voltar aos detalhes
              </button>
              <button
                type="button"
                onClick={loadPdfDocument}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-display font-bold transition-colors cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={viewportContainerRef}
            className="relative flex-1 w-full min-h-[76vh] rounded-2xl bg-[#0B0F19] border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.75)] overflow-x-auto overflow-y-auto flex justify-center items-start py-4 sm:py-6 px-2 sm:px-6"
          >
            {isRenderingPage && (
              <div className="pointer-events-none absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0E131F]/90 border border-white/[0.08] text-[11px] text-cyan-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Renderizando...</span>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className="block mx-auto rounded-lg shadow-[0_12px_36px_rgba(0,0,0,0.85)] bg-white"
            />
          </div>
        )}
      </main>
    </div>
  );
};

