import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTitleForComparison } from './driveInventoryBackend';
import { PHASE16_EBOOK_SOURCES } from './batchCatalogImporter';

const execFileAsync = promisify(execFile);

export const BOOK_COVERS_BUCKET = 'book-covers';
const COVERS_REPORT_BUCKET = 'crt-drive-inventory';
const COVERS_REPORT_OBJECT = 'latest_covers_batch_report_v1.json';

export interface Phase17CoverBatchReport {
  runId: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'partial' | 'failed';
  totalWorksAnalyzed: number;
  alreadyHadValidCoverCount: number;
  extractedFromFilesCount: number;
  extractedBreakdown: {
    pdfFirstPageCoversCount: number;
    audioEmbeddedMetadataCoversCount: number;
    audioMatchedDriveCoversCount: number;
  };
  rejectedTextOrTocPagesCount: number;
  substituteCoversCreatedCount: number;
  substituteBreakdown: {
    ebooksSubstituteCount: number;
    audiobooksSubstituteCount: number;
  };
  remainingWithoutCoverCount: number;
  storedAndLinkedInSupabaseCount: number;
  totalWorksWithValidCoverAfterRun: number;
  errorsCount: number;
  errors: Array<{
    workId: string;
    title: string;
    reason: string;
  }>;
  sampleExtractedCovers: Array<{
    workId: string;
    title: string;
    format: 'ebook' | 'audio';
    sourceMethod: string;
    coverUrl: string;
    byteSize: number;
  }>;
  sampleSubstituteCovers: Array<{
    workId: string;
    title: string;
    author: string | null;
    format: 'ebook' | 'audio';
    coverUrl: string;
    byteSize: number;
  }>;
}

let latestCoverReportMemory: Phase17CoverBatchReport | null = null;

interface DriveThumbnailEntry {
  driveFileId: string;
  name: string;
  thumbnailLink: string;
  normalizedTitle: string;
}

const CRT_EDITORIAL_PALETTES = [
  {
    bgTop: '#0B192C',
    bgBottom: '#050811',
    accent: '#22D3EE',
    borderRgba: 'rgba(34,211,238,0.26)',
    ringRgba: 'rgba(34,211,238,0.12)',
  },
  {
    bgTop: '#1C160B',
    bgBottom: '#070604',
    accent: '#F59E0B',
    borderRgba: 'rgba(245,158,11,0.26)',
    ringRgba: 'rgba(245,158,11,0.12)',
  },
  {
    bgTop: '#071F1A',
    bgBottom: '#040908',
    accent: '#10B981',
    borderRgba: 'rgba(16,185,129,0.26)',
    ringRgba: 'rgba(16,185,129,0.12)',
  },
  {
    bgTop: '#12132E',
    bgBottom: '#060711',
    accent: '#818CF8',
    borderRgba: 'rgba(129,140,248,0.26)',
    ringRgba: 'rgba(129,140,248,0.12)',
  },
  {
    bgTop: '#1E1124',
    bgBottom: '#07050A',
    accent: '#38BDF8',
    borderRgba: 'rgba(56,189,248,0.26)',
    ringRgba: 'rgba(56,189,248,0.12)',
  },
  {
    bgTop: '#141E28',
    bgBottom: '#05080C',
    accent: '#2DD4BF',
    borderRgba: 'rgba(45,212,191,0.26)',
    ringRgba: 'rgba(45,212,191,0.12)',
  },
] as const;

function pickPaletteForWork(workId: string) {
  let hash = 0;
  for (let i = 0; i < workId.length; i++) {
    hash = (hash * 31 + workId.charCodeAt(i)) >>> 0;
  }
  return CRT_EDITORIAL_PALETTES[hash % CRT_EDITORIAL_PALETTES.length];
}

function wrapTextIntoLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return ['Obra do Acervo'];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  const consumedWordsCount = lines.join(' ').split(' ').filter(Boolean).length;
  const remainingWords = words.slice(consumedWordsCount);
  if (remainingWords.length > 0) {
    let lastLine = remainingWords.join(' ');
    if (lastLine.length > maxCharsPerLine + 4) {
      lastLine = `${lastLine.slice(0, maxCharsPerLine).trim()}...`;
    }
    lines.push(lastLine);
  } else if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
}

/**
 * Analisa uma imagem de primeira página (PNG/JPEG) para verificar se é realmente uma capa gráfica
 * ou se é apenas uma página de texto corrido, sumário ou página em branco.
 */
async function validateAndConvertExtractedCoverTo2x3Webp(
  sourceImageBuffer: Buffer,
  workId: string,
  isSquareAudioArt = false
): Promise<{
  isValidCover: boolean;
  rejectedAsTextOrBlank: boolean;
  webpBuffer: Buffer | null;
}> {
  const suffix = `${workId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpIn = path.join(os.tmpdir(), `crt_in_${suffix}.img`);
  const tmpOut = path.join(os.tmpdir(), `crt_out_${suffix}.webp`);

  try {
    await fs.promises.writeFile(tmpIn, sourceImageBuffer);

    const { stdout } = await execFileAsync('/usr/bin/convert', [
      tmpIn,
      '-colorspace',
      'HSL',
      '-format',
      '%[fx:mean.b]|%[fx:standard_deviation.b]|%[fx:mean.g]|%w|%h',
      'info:',
    ]);

    const parts = stdout.trim().split('|');
    const meanL = Number(parts[0]) || 0;
    const stdL = Number(parts[1]) || 0;
    const meanS = Number(parts[2]) || 0;
    const width = Number(parts[3]) || 600;
    const height = Number(parts[4]) || 900;

    // 1. Rejeitar página em branco ou quase uniforme
    if (stdL < 0.045 || (meanL > 0.975 && stdL < 0.07)) {
      return {
        isValidCover: false,
        rejectedAsTextOrBlank: true,
        webpBuffer: null,
      };
    }

    // 2. Rejeitar página de texto puro P&B / Sumário (fundo > 87% branco e saturação de cor quase zero)
    if (!isSquareAudioArt && meanL > 0.87 && meanS < 0.028) {
      return {
        isValidCover: false,
        rejectedAsTextOrBlank: true,
        webpBuffer: null,
      };
    }

    // 3. Converter para WebP vertical 2:3 (600x900) otimizado para celular
    const ratio = height / Math.max(1, width);
    if (isSquareAudioArt || ratio < 1.18) {
      // Se for capa quadrada (ex: metadado APIC de MP3), centraliza no canvas 2:3 escuro sem cortar texto da arte
      await execFileAsync('/usr/bin/convert', [
        '-size',
        '600x900',
        'gradient:#0D1526-#060911',
        '(',
        tmpIn,
        '-resize',
        '540x540',
        ')',
        '-gravity',
        'center',
        '-composite',
        '-quality',
        '82',
        tmpOut,
      ]);
    } else {
      await execFileAsync('/usr/bin/convert', [
        tmpIn,
        '-resize',
        '600x900^',
        '-gravity',
        'center',
        '-extent',
        '600x900',
        '-quality',
        '82',
        tmpOut,
      ]);
    }

    if (!fs.existsSync(tmpOut)) {
      return {
        isValidCover: false,
        rejectedAsTextOrBlank: false,
        webpBuffer: null,
      };
    }

    const webpBuffer = await fs.promises.readFile(tmpOut);
    if (!webpBuffer || webpBuffer.length < 500) {
      return {
        isValidCover: false,
        rejectedAsTextOrBlank: false,
        webpBuffer: null,
      };
    }

    return {
      isValidCover: true,
      rejectedAsTextOrBlank: false,
      webpBuffer,
    };
  } catch {
    return {
      isValidCover: false,
      rejectedAsTextOrBlank: false,
      webpBuffer: null,
    };
  } finally {
    await fs.promises.unlink(tmpIn).catch(() => {});
    await fs.promises.unlink(tmpOut).catch(() => {});
  }
}

/**
 * Fallback via Ghostscript na primeira página do PDF quando thumbnailLink não estiver disponível.
 */
async function extractPdfFirstPageViaGhostscript(
  accessToken: string | null,
  apiKey: string,
  driveFileId: string,
  workId: string
): Promise<{
  isValidCover: boolean;
  rejectedAsTextOrBlank: boolean;
  webpBuffer: Buffer | null;
}> {
  const suffix = `${workId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpPdf = path.join(os.tmpdir(), `crt_pdf_${suffix}.pdf`);
  const tmpPng = path.join(os.tmpdir(), `crt_p1_${suffix}.png`);

  try {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
    );
    url.searchParams.set('alt', 'media');
    url.searchParams.set('supportsAllDrives', 'true');

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (apiKey) {
      url.searchParams.set('key', apiKey);
    }

    const res = await fetch(url.toString(), { method: 'GET', headers });
    if (!res.ok) {
      return { isValidCover: false, rejectedAsTextOrBlank: false, webpBuffer: null };
    }

    const pdfBuf = Buffer.from(await res.arrayBuffer());
    if (pdfBuf.length < 1024) {
      return { isValidCover: false, rejectedAsTextOrBlank: false, webpBuffer: null };
    }

    await fs.promises.writeFile(tmpPdf, pdfBuf);

    // Verificar texto da página 1 via Ghostscript txtwrite para barrar Sumário/Índice
    try {
      const { stdout: page1Text } = await execFileAsync('/usr/bin/gs', [
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dFirstPage=1',
        '-dLastPage=1',
        '-sDEVICE=txtwrite',
        '-sOutputFile=-',
        tmpPdf,
      ]);
      const cleanTxt = (page1Text || '').trim();
      const wordsCount = cleanTxt.split(/\s+/).filter(Boolean).length;
      if (
        /\b(sum[aá]rio|[ií]ndice|table of contents|cap[ií]tulo\s+1|pref[aá]cio)\b/i.test(
          cleanTxt
        ) ||
        wordsCount > 140
      ) {
        return {
          isValidCover: false,
          rejectedAsTextOrBlank: true,
          webpBuffer: null,
        };
      }
    } catch {
      // prossegue para validação visual
    }

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
      `-sOutputFile=${tmpPng}`,
      tmpPdf,
    ]);

    if (!fs.existsSync(tmpPng)) {
      return { isValidCover: false, rejectedAsTextOrBlank: false, webpBuffer: null };
    }

    const pngBuf = await fs.promises.readFile(tmpPng);
    return await validateAndConvertExtractedCoverTo2x3Webp(pngBuf, workId, false);
  } catch {
    return { isValidCover: false, rejectedAsTextOrBlank: false, webpBuffer: null };
  } finally {
    await fs.promises.unlink(tmpPdf).catch(() => {});
    await fs.promises.unlink(tmpPng).catch(() => {});
  }
}

/**
 * Tenta extrair imagem embutida (ID3v2 APIC ou MP4 covr) dos primeiros 512 KB de um arquivo MP3/M4A.
 */
async function tryExtractEmbeddedAudioCover(
  accessToken: string | null,
  apiKey: string,
  driveFileId: string,
  workId: string
): Promise<Buffer | null> {
  const suffix = `${workId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpAudioSlice = path.join(os.tmpdir(), `crt_aud_${suffix}.mp3`);
  const tmpExtractedImg = path.join(os.tmpdir(), `crt_apic_${suffix}.jpg`);

  try {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
    );
    url.searchParams.set('alt', 'media');
    url.searchParams.set('supportsAllDrives', 'true');

    const baseHeaders: Record<string, string> = {};
    if (accessToken) {
      baseHeaders.Authorization = `Bearer ${accessToken}`;
    } else if (apiKey) {
      url.searchParams.set('key', apiKey);
    }

    // 1. Sonda rápida nos primeiros 64 KB para detectar tag APIC/covr
    const probeRes = await fetch(url.toString(), {
      method: 'GET',
      headers: { ...baseHeaders, Range: 'bytes=0-65535' },
    });
    if (!probeRes.ok && probeRes.status !== 206) return null;

    let sliceBuf = Buffer.from(await probeRes.arrayBuffer());
    const hasApicOrCovr =
      sliceBuf.includes(Buffer.from('APIC')) ||
      sliceBuf.includes(Buffer.from('covr')) ||
      sliceBuf.includes(Buffer.from('image/jpeg')) ||
      sliceBuf.includes(Buffer.from('image/png'));

    if (!hasApicOrCovr) return null;

    // 2. Quando houver capa embutida, busca 1 MB inicial para garantir a imagem completa
    const fullHeaderRes = await fetch(url.toString(), {
      method: 'GET',
      headers: { ...baseHeaders, Range: 'bytes=0-1048575' },
    });
    if (fullHeaderRes.ok || fullHeaderRes.status === 206) {
      sliceBuf = Buffer.from(await fullHeaderRes.arrayBuffer());
    }

    await fs.promises.writeFile(tmpAudioSlice, sliceBuf);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      tmpAudioSlice,
      '-an',
      '-vframes',
      '1',
      tmpExtractedImg,
    ]).catch(() => {});

    if (!fs.existsSync(tmpExtractedImg)) return null;
    const imgBuf = await fs.promises.readFile(tmpExtractedImg);
    if (!imgBuf || imgBuf.length < 512) return null;

    const converted = await validateAndConvertExtractedCoverTo2x3Webp(
      imgBuf,
      workId,
      true
    );
    return converted.isValidCover ? converted.webpBuffer : null;
  } catch {
    return null;
  } finally {
    await fs.promises.unlink(tmpAudioSlice).catch(() => {});
    await fs.promises.unlink(tmpExtractedImg).catch(() => {});
  }
}

/**
 * Gera uma Capa Gráfica Substituta elegante em WebP 2:3 (600x900) com:
 * - Título real da obra (quebra automática de linha);
 * - Autor real (quando disponível, sem inventar);
 * - Identidade visual escura do CRT Books;
 * - Identificação explícita de "CAPA GRÁFICA SUBSTITUTA · CRT BOOKS" (não oficial da editora).
 */
export async function generateCrtSubstituteCoverWebp(params: {
  workId: string;
  title: string;
  author: string | null;
  format: 'ebook' | 'audio';
}): Promise<Buffer> {
  const { workId, title, author, format } = params;
  const palette = pickPaletteForWork(workId);
  const suffix = `${workId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpOut = path.join(os.tmpdir(), `crt_sub_${suffix}.webp`);

  const cleanTitle = (title || 'Obra do Acervo').trim();
  const titleLines = wrapTextIntoLines(cleanTitle, 21, 5);
  const cleanAuthor =
    author &&
    author.trim() &&
    author.trim().toLowerCase() !== 'autor desconhecido' &&
    author.trim().toLowerCase() !== 'autor não informado'
      ? author.trim()
      : null;
  const authorLines = cleanAuthor ? wrapTextIntoLines(cleanAuthor, 30, 2) : [];

  const boldFont = '/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf';
  const regularFont = '/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf';

  const formatBadgeText =
    format === 'audio' ? 'AUDIOBOOK · STREAMING' : 'EBOOK · LEITOR DIGITAL';

  const args: string[] = [
    '-size',
    '600x900',
    `gradient:${palette.bgTop}-${palette.bgBottom}`,
    // Vinheta lateral de lombada
    '-fill',
    'rgba(255,255,255,0.06)',
    '-draw',
    'rectangle 0,0 14,900',
    // Moldura editorial externa
    '-fill',
    'none',
    '-stroke',
    palette.borderRgba,
    '-strokewidth',
    '2',
    '-draw',
    'roundrectangle 28,28 572,872 22,22',
    // Geometria arquitetônica CRT Books
    '-stroke',
    palette.ringRgba,
    '-strokewidth',
    '1.5',
    '-draw',
    'circle 430,250 430,90',
    '-draw',
    'circle 430,250 430,145',
    '-draw',
    'line 60,130 540,130',
    '-draw',
    'line 60,790 540,790',
    // Cabeçalho CRT Books
    '-stroke',
    'none',
    '-font',
    boldFont,
    '-fill',
    palette.accent,
    '-pointsize',
    '16',
    '-annotate',
    '+60+82',
    'CRT BOOKS',
    '-fill',
    '#94A3B8',
    '-font',
    regularFont,
    '-pointsize',
    '14',
    '-annotate',
    '+60+108',
    formatBadgeText,
  ];

  // Linhas do Título Real
  const baseTitleY = titleLines.length <= 2 ? 390 : titleLines.length === 3 ? 360 : 325;
  const lineSpacing = 50;

  args.push('-font', boldFont, '-fill', '#F8FAFC', '-pointsize', '38');
  titleLines.forEach((line, idx) => {
    const y = baseTitleY + idx * lineSpacing;
    args.push('-annotate', `+60+${y}`, line);
  });

  // Barra de destaque abaixo do título
  const barY = baseTitleY + titleLines.length * lineSpacing - 12;
  args.push(
    '-fill',
    palette.accent,
    '-draw',
    `rectangle 60,${barY} 165,${barY + 5}`
  );

  // Autor Real (apenas quando disponível; não inventa autor)
  if (authorLines.length > 0) {
    args.push('-font', regularFont, '-fill', '#CBD5E1', '-pointsize', '25');
    authorLines.forEach((aLine, idx) => {
      const ay = barY + 52 + idx * 34;
      args.push('-annotate', `+60+${ay}`, aLine);
    });
  }

  // Rodapé explícito de Capa Gráfica Substituta (Regra 5: não apresentar como capa oficial da editora)
  args.push(
    '-font',
    regularFont,
    '-fill',
    '#64748B',
    '-pointsize',
    '13',
    '-annotate',
    '+60+830',
    'EDIÇÃO DIGITAL CRT BOOKS · CAPA GRÁFICA SUBSTITUTA',
    '-quality',
    '82',
    tmpOut
  );

  try {
    await execFileAsync('/usr/bin/convert', args);
    return await fs.promises.readFile(tmpOut);
  } finally {
    await fs.promises.unlink(tmpOut).catch(() => {});
  }
}

async function listDriveFolderThumbnailsPaginated(
  accessToken: string | null,
  apiKey: string,
  folderId: string
): Promise<DriveThumbnailEntry[]> {
  const entries: DriveThumbnailEntry[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set(
      'fields',
      'nextPageToken,files(id,name,mimeType,size,hasThumbnail,thumbnailLink)'
    );
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set('supportsAllDrives', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (apiKey) {
      url.searchParams.set('key', apiKey);
    }

    const res = await fetch(url.toString(), { method: 'GET', headers });
    if (!res.ok) break;

    const payload = (await res.json().catch(() => ({}))) as {
      nextPageToken?: string;
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        thumbnailLink?: string;
      }>;
    };

    for (const f of payload.files || []) {
      if (f.thumbnailLink && Number(f.size || 0) > 10240) {
        const rawTitle = (f.name || '')
          .replace(/\.[a-z0-9]{2,5}$/i, '')
          .split(' - ')[0]
          .trim();
        entries.push({
          driveFileId: f.id,
          name: f.name,
          thumbnailLink: f.thumbnailLink,
          normalizedTitle: normalizeTitleForComparison(rawTitle),
        });
      }
    }

    pageToken = payload.nextPageToken || undefined;
  } while (pageToken);

  return entries;
}

async function saveCoverBatchReport(
  sb: SupabaseClient,
  report: Phase17CoverBatchReport
): Promise<void> {
  latestCoverReportMemory = report;
  try {
    const buf = Buffer.from(JSON.stringify(report, null, 2), 'utf-8');
    await sb.storage
      .from(COVERS_REPORT_BUCKET)
      .upload(COVERS_REPORT_OBJECT, buf, {
        contentType: 'application/json',
        upsert: true,
      });
  } catch {
    // ignore optional report persistence error
  }
}

export async function loadLatestCoverBatchReport(
  sb: SupabaseClient
): Promise<Phase17CoverBatchReport | null> {
  if (latestCoverReportMemory) return latestCoverReportMemory;
  try {
    const res = await sb.storage
      .from(COVERS_REPORT_BUCKET)
      .download(COVERS_REPORT_OBJECT);
    if (res.error || !res.data) return null;
    const text = await res.data.text();
    const parsed = JSON.parse(text) as Phase17CoverBatchReport;
    latestCoverReportMemory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Executa o processamento em lote da Fase 17 para corrigir automaticamente as capas
 * dos 250 ebooks e 225 audiobooks (475 obras):
 * - Preserva obras que já possuem capa válida no Supabase Storage;
 * - Para PDFs: extrai a página 1 quando for realmente uma capa gráfica (rejeitando páginas de texto/sumário);
 * - Para Audiobooks: prioriza imagem embutida (ID3 APIC / MP4 covr) ou capa correspondente existente no Google Drive;
 * - Para obras sem capa extraível: gera capa gráfica substituta WebP 2:3 (600x900) com título e autor reais e identidade CRT Books;
 * - Armazena todas as capas no bucket persistente `book-covers` do Supabase Storage e vincula `works.cover_url`.
 */
export async function executePhase17BatchCoversProcess(params: {
  sb: SupabaseClient;
  accessToken: string | null;
  apiKey: string;
  forceRegenerate?: boolean;
  concurrency?: number;
}): Promise<Phase17CoverBatchReport> {
  const {
    sb,
    accessToken,
    apiKey,
    forceRegenerate = false,
    concurrency = 15,
  } = params;

  const startedAt = new Date().toISOString();
  const runId = `covers-p17-${Date.now()}`;

  // 1. Garantir que o bucket público `book-covers` existe no Supabase Storage
  const { data: buckets } = await sb.storage.listBuckets();
  const bucketExists = (buckets || []).some(
    (b) => b.name === BOOK_COVERS_BUCKET || b.id === BOOK_COVERS_BUCKET
  );
  if (!bucketExists) {
    await sb.storage.createBucket(BOOK_COVERS_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
      fileSizeLimit: 5 * 1024 * 1024,
    });
  }

  // 2. Carregar todas as 475 obras, autores e assets
  const [{ data: worksRows, error: worksErr }, { data: assetsRows, error: assetsErr }, { data: authorsRows }] =
    await Promise.all([
      sb
        .from('works')
        .select('id, title, slug, author_id, cover_url, status, rights_status')
        .order('created_at', { ascending: true })
        .range(0, 4999),
      sb
        .from('assets')
        .select('id, work_id, asset_type, drive_file_id, mime_type, file_size')
        .range(0, 4999),
      sb.from('authors').select('id, name').range(0, 4999),
    ]);

  if (worksErr) {
    throw new Error(`Erro ao carregar works: ${worksErr.message}`);
  }
  if (assetsErr) {
    throw new Error(`Erro ao carregar assets: ${assetsErr.message}`);
  }

  const worksList = Array.isArray(worksRows) ? worksRows : [];
  const assetsList = Array.isArray(assetsRows) ? assetsRows : [];
  const authorsList = Array.isArray(authorsRows) ? authorsRows : [];

  const authorNameById = new Map<string, string>();
  for (const au of authorsList) {
    if (au.id && au.name) {
      authorNameById.set(String(au.id), String(au.name));
    }
  }

  const assetsByWorkId = new Map<
    string,
    Array<{
      id: string;
      work_id: string;
      asset_type: string;
      drive_file_id: string | null;
      mime_type: string | null;
      file_size: number | null;
    }>
  >();
  for (const a of assetsList) {
    const wid = String(a.work_id || '');
    if (!wid) continue;
    const arr = assetsByWorkId.get(wid) || [];
    arr.push(a);
    assetsByWorkId.set(wid, arr);
  }

  // 3. Carregar mapa de thumbnails de página 1 das pastas de ebooks do Google Drive
  const thumbByDriveId = new Map<string, string>();
  const thumbByNormTitle = new Map<string, DriveThumbnailEntry>();

  const folderEntriesArrays = await Promise.all(
    PHASE16_EBOOK_SOURCES.map((src) =>
      listDriveFolderThumbnailsPaginated(accessToken, apiKey, src.folderId)
    )
  );

  for (const entries of folderEntriesArrays) {
    for (const entry of entries) {
      thumbByDriveId.set(entry.driveFileId, entry.thumbnailLink);
      if (
        entry.normalizedTitle &&
        !thumbByNormTitle.has(entry.normalizedTitle)
      ) {
        thumbByNormTitle.set(entry.normalizedTitle, entry);
      }
    }
  }

  let alreadyHadValidCoverCount = 0;
  let pdfFirstPageCoversCount = 0;
  let audioEmbeddedMetadataCoversCount = 0;
  let audioMatchedDriveCoversCount = 0;
  let rejectedTextOrTocPagesCount = 0;
  let ebooksSubstituteCount = 0;
  let audiobooksSubstituteCount = 0;
  let storedAndLinkedInSupabaseCount = 0;

  const errors: Phase17CoverBatchReport['errors'] = [];
  const sampleExtractedCovers: Phase17CoverBatchReport['sampleExtractedCovers'] =
    [];
  const sampleSubstituteCovers: Phase17CoverBatchReport['sampleSubstituteCovers'] =
    [];

  // Separar obras que já possuem capa válida das que precisam de processamento
  const worksToProcess: typeof worksList = [];
  for (const work of worksList) {
    const existingUrl = work.cover_url ? String(work.cover_url).trim() : '';
    const hasPermanentStorageCover =
      existingUrl.startsWith('https://') &&
      existingUrl.includes(`/${BOOK_COVERS_BUCKET}/`);

    if (hasPermanentStorageCover && !forceRegenerate) {
      alreadyHadValidCoverCount += 1;
    } else {
      worksToProcess.push(work);
    }
  }

  const KNOWN_AUDIO_WITH_EMBEDDED_ART = new Set<string>([
    '1wQRWBgVTn8gTlwU734fcC-NkBjgmHQoG',
    '1-Y0XEgurh2ueBGf8q7dly915_3ZlkfqR',
  ]);

  const safeConcurrency = Math.max(1, Math.min(25, concurrency));

  for (let i = 0; i < worksToProcess.length; i += safeConcurrency) {
    const batch = worksToProcess.slice(i, i + safeConcurrency);

    await Promise.all(
      batch.map(async (work) => {
        const workId = String(work.id);
        const workTitle = String(work.title || 'Obra do Acervo');
        const workAuthor = work.author_id
          ? authorNameById.get(String(work.author_id)) || null
          : null;
        const workAssets = assetsByWorkId.get(workId) || [];
        const ebookAsset = workAssets.find((a) => a.asset_type === 'ebook');
        const audioAsset = workAssets.find((a) => a.asset_type === 'audio');
        const primaryFormat: 'ebook' | 'audio' = ebookAsset ? 'ebook' : 'audio';

        try {
          let finalWebpBuffer: Buffer | null = null;
          let coverCategory:
            | 'pdf_page1'
            | 'audio_embedded'
            | 'audio_matched_drive'
            | 'substitute' = 'substitute';

          // CASO A: EBOOK EM PDF
          if (ebookAsset && ebookAsset.drive_file_id) {
            const driveId = String(ebookAsset.drive_file_id);
            const thumbLink = thumbByDriveId.get(driveId);

            if (thumbLink) {
              const hiResUrl = thumbLink.replace(/=s\d+.*$/, '=s900');
              const imgRes = await fetch(hiResUrl).catch(() => null);
              if (imgRes && imgRes.ok) {
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                const validated =
                  await validateAndConvertExtractedCoverTo2x3Webp(
                    imgBuf,
                    workId,
                    false
                  );
                if (validated.rejectedAsTextOrBlank) {
                  rejectedTextOrTocPagesCount += 1;
                } else if (validated.isValidCover && validated.webpBuffer) {
                  finalWebpBuffer = validated.webpBuffer;
                  coverCategory = 'pdf_page1';
                }
              }
            }

            // Fallback via Ghostscript se não havia thumbnailLink
            if (!finalWebpBuffer && !thumbLink) {
              const gsResult = await extractPdfFirstPageViaGhostscript(
                accessToken,
                apiKey,
                driveId,
                workId
              );
              if (gsResult.rejectedAsTextOrBlank) {
                rejectedTextOrTocPagesCount += 1;
              } else if (gsResult.isValidCover && gsResult.webpBuffer) {
                finalWebpBuffer = gsResult.webpBuffer;
                coverCategory = 'pdf_page1';
              }
            }
          }

          // CASO B: AUDIOBOOK MP3 / M4A
          if (!finalWebpBuffer && audioAsset && audioAsset.drive_file_id) {
            const driveId = String(audioAsset.drive_file_id);

            // B1. Procurar imagem incorporada nos metadados do áudio (APIC / covr)
            if (KNOWN_AUDIO_WITH_EMBEDDED_ART.has(driveId)) {
              const embeddedWebp = await tryExtractEmbeddedAudioCover(
                accessToken,
                apiKey,
                driveId,
                workId
              );
              if (embeddedWebp) {
                finalWebpBuffer = embeddedWebp;
                coverCategory = 'audio_embedded';
              }
            }

            // B2. Procurar capa correspondente existente nas pastas do Google Drive pelo título normalizado
            if (!finalWebpBuffer) {
              const normAudioTitle = normalizeTitleForComparison(workTitle)
                .replace(/\s*parte\s*\d+\s*de\s*\d+\s*/gi, '')
                .replace(/\s*parte\s*\d+\s*/gi, '')
                .trim();

              const matchedDriveEntry =
                thumbByNormTitle.get(normAudioTitle) || null;
              if (matchedDriveEntry) {
                const hiResUrl = matchedDriveEntry.thumbnailLink.replace(
                  /=s\d+.*$/,
                  '=s900'
                );
                const imgRes = await fetch(hiResUrl).catch(() => null);
                if (imgRes && imgRes.ok) {
                  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                  const validated =
                    await validateAndConvertExtractedCoverTo2x3Webp(
                      imgBuf,
                      workId,
                      false
                    );
                  if (validated.isValidCover && validated.webpBuffer) {
                    finalWebpBuffer = validated.webpBuffer;
                    coverCategory = 'audio_matched_drive';
                  }
                }
              }
            }
          }

          // CASO C: CAPA GRÁFICA SUBSTITUTA CRT BOOKS (quando não houver capa extraível válida)
          if (!finalWebpBuffer) {
            finalWebpBuffer = await generateCrtSubstituteCoverWebp({
              workId,
              title: workTitle,
              author: workAuthor,
              format: primaryFormat,
            });
            coverCategory = 'substitute';
          }

          // Upload persistente no Supabase Storage (proporção 2:3 em WebP)
          const storagePath = `covers/${workId}.webp`;
          const { error: uploadErr } = await sb.storage
            .from(BOOK_COVERS_BUCKET)
            .upload(storagePath, finalWebpBuffer, {
              contentType: 'image/webp',
              upsert: true,
              cacheControl: '31536000',
            });

          if (uploadErr) {
            throw new Error(
              `Erro no upload Storage (${storagePath}): ${uploadErr.message}`
            );
          }

          const { data: pubUrlData } = sb.storage
            .from(BOOK_COVERS_BUCKET)
            .getPublicUrl(storagePath);

          const publicCoverUrl = pubUrlData?.publicUrl;
          if (!publicCoverUrl) {
            throw new Error('URL pública não retornada pelo Supabase Storage.');
          }

          // Vincular exclusivamente works.cover_url no banco de dados
          const { error: updateErr } = await sb
            .from('works')
            .update({
              cover_url: publicCoverUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', workId);

          if (updateErr) {
            throw new Error(
              `Erro ao vincular works.cover_url: ${updateErr.message}`
            );
          }

          storedAndLinkedInSupabaseCount += 1;

          if (coverCategory === 'pdf_page1') {
            pdfFirstPageCoversCount += 1;
            if (sampleExtractedCovers.length < 10) {
              sampleExtractedCovers.push({
                workId,
                title: workTitle,
                format: primaryFormat,
                sourceMethod: 'pdf_first_page_verified',
                coverUrl: publicCoverUrl,
                byteSize: finalWebpBuffer.length,
              });
            }
          } else if (coverCategory === 'audio_embedded') {
            audioEmbeddedMetadataCoversCount += 1;
            if (sampleExtractedCovers.length < 10) {
              sampleExtractedCovers.push({
                workId,
                title: workTitle,
                format: primaryFormat,
                sourceMethod: 'audio_embedded_metadata',
                coverUrl: publicCoverUrl,
                byteSize: finalWebpBuffer.length,
              });
            }
          } else if (coverCategory === 'audio_matched_drive') {
            audioMatchedDriveCoversCount += 1;
            if (sampleExtractedCovers.length < 10) {
              sampleExtractedCovers.push({
                workId,
                title: workTitle,
                format: primaryFormat,
                sourceMethod: 'drive_associated_cover',
                coverUrl: publicCoverUrl,
                byteSize: finalWebpBuffer.length,
              });
            }
          } else {
            if (primaryFormat === 'ebook') {
              ebooksSubstituteCount += 1;
            } else {
              audiobooksSubstituteCount += 1;
            }
            if (sampleSubstituteCovers.length < 10) {
              sampleSubstituteCovers.push({
                workId,
                title: workTitle,
                author: workAuthor,
                format: primaryFormat,
                coverUrl: publicCoverUrl,
                byteSize: finalWebpBuffer.length,
              });
            }
          }
        } catch (err) {
          errors.push({
            workId,
            title: workTitle,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  }

  // Verificar estado final real no Supabase
  const { data: finalWorks } = await sb
    .from('works')
    .select('id, cover_url')
    .range(0, 4999);

  const finalWorksArr = Array.isArray(finalWorks) ? finalWorks : [];
  const totalWithValidCover = finalWorksArr.filter((w) => {
    const u = w.cover_url ? String(w.cover_url).trim() : '';
    return u.startsWith('https://') && u.includes(`/${BOOK_COVERS_BUCKET}/`);
  }).length;
  const remainingWithoutCoverCount = Math.max(
    0,
    finalWorksArr.length - totalWithValidCover
  );

  const extractedFromFilesCount =
    pdfFirstPageCoversCount +
    audioEmbeddedMetadataCoversCount +
    audioMatchedDriveCoversCount;
  const substituteCoversCreatedCount =
    ebooksSubstituteCount + audiobooksSubstituteCount;

  const report: Phase17CoverBatchReport = {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    status:
      errors.length === 0 && remainingWithoutCoverCount === 0
        ? 'completed'
        : 'partial',
    totalWorksAnalyzed: worksList.length,
    alreadyHadValidCoverCount,
    extractedFromFilesCount,
    extractedBreakdown: {
      pdfFirstPageCoversCount,
      audioEmbeddedMetadataCoversCount,
      audioMatchedDriveCoversCount,
    },
    rejectedTextOrTocPagesCount,
    substituteCoversCreatedCount,
    substituteBreakdown: {
      ebooksSubstituteCount,
      audiobooksSubstituteCount,
    },
    remainingWithoutCoverCount,
    storedAndLinkedInSupabaseCount,
    totalWorksWithValidCoverAfterRun: totalWithValidCover,
    errorsCount: errors.length,
    errors,
    sampleExtractedCovers,
    sampleSubstituteCovers,
  };

  await saveCoverBatchReport(sb, report);
  return report;
}
