import { SupabaseClient } from '@supabase/supabase-js';
import {
  EXCLUDED_SUPER_BONUS_FOLDER_IDS,
  extractMetadataFromFilename,
  isExcludedSuperBonusFolder,
  normalizeTitleForComparison,
} from './driveInventoryBackend';

export interface BatchSourceFolderConfig {
  key: string;
  label: string;
  folderId: string;
  url: string;
  targetType: 'ebook' | 'audio';
}

export const PHASE16_EBOOK_SOURCES: readonly BatchSourceFolderConfig[] = [
  {
    key: 'ebooks_1',
    label: 'Ebooks Fonte 1 (Canal Enriquecendo a Mente)',
    folderId: '1KgyMW0W9e_7PqYn51o36FgW-hXH54AGU',
    url: 'https://drive.google.com/drive/folders/1KgyMW0W9e_7PqYn51o36FgW-hXH54AGU',
    targetType: 'ebook',
  },
  {
    key: 'ebooks_2',
    label: 'Ebooks Fonte 2 (Biblioteca LP Ebooks)',
    folderId: '1JOSnganIK08JXrc7k-fTecucb5bPqv1t',
    url: 'https://drive.google.com/drive/folders/1JOSnganIK08JXrc7k-fTecucb5bPqv1t',
    targetType: 'ebook',
  },
] as const;

export const PHASE16_AUDIO_SOURCES: readonly BatchSourceFolderConfig[] = [
  {
    key: 'audio_1',
    label: 'Audiobooks Fonte 1 (Audiolivros Principal)',
    folderId: '1HjOIzbvYW9LoZhq9DsIaAznspLKaec1I',
    url: 'https://drive.google.com/drive/folders/1HjOIzbvYW9LoZhq9DsIaAznspLKaec1I',
    targetType: 'audio',
  },
  {
    key: 'audio_2',
    label: 'Audiobooks Fonte 2 (Acervo AudioBook)',
    folderId: '1-6gsrxIJVE9k4eEBVSWEnloFKZQ56_ap',
    url: 'https://drive.google.com/drive/folders/1-6gsrxIJVE9k4eEBVSWEnloFKZQ56_ap',
    targetType: 'audio',
  },
  {
    key: 'audio_3',
    label: 'Audiobooks Fonte 3 (LP Audiobooks)',
    folderId: '1RI9d8lkulu66QiRGrd35h7_vs2ak_350',
    url: 'https://drive.google.com/drive/folders/1RI9d8lkulu66QiRGrd35h7_vs2ak_350',
    targetType: 'audio',
  },
] as const;

export const TARGET_EBOOK_CATALOG_COUNT = 250;
export const TARGET_AUDIO_CATALOG_COUNT = 225;
export const TARGET_TOTAL_CATALOG_COUNT =
  TARGET_EBOOK_CATALOG_COUNT + TARGET_AUDIO_CATALOG_COUNT; // 475

interface RawDriveFileNode {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  fileExtension?: string;
  md5Checksum?: string;
  sourceKey: string;
  sourceLabel: string;
  folderPath: string;
}

export interface BatchSourceScanResult {
  key: string;
  label: string;
  folderId: string;
  url: string;
  targetType: 'ebook' | 'audio';
  accessStatus: 'accessible' | 'denied' | 'not_found' | 'error';
  httpStatus: number;
  errorMessage: string | null;
  totalFilesFound: number;
  eligibleFilesCount: number;
  incompatibleOrCorruptedCount: number;
  excludedBonusSubfolders: string[];
}

export interface BatchImportProgressReport {
  runId: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'partial' | 'failed';
  batchSize: number;
  totalBatchesPlanned: number;
  batchesCompleted: number;
  targets: {
    ebooksTarget: number;
    audiobooksTarget: number;
    totalTarget: number;
  };
  catalogBefore: {
    worksCount: number;
    ebooksCount: number;
    audiobooksCount: number;
    authorsCount: number;
  };
  catalogAfter: {
    worksCount: number;
    ebooksCount: number;
    audiobooksCount: number;
    authorsCount: number;
  };
  executionSummary: {
    preservedExistingWorksCount: number;
    updatedExistingWorksCount: number;
    newlyImportedEbooksCount: number;
    newlyImportedAudiobooksCount: number;
    newlyCreatedWorksCount: number;
    newlyCreatedAssetsCount: number;
    newlyCreatedAuthorsCount: number;
    skippedDuplicatesCount: number;
    skippedIncompatibleOrZeroSizeCount: number;
    failedItemsCount: number;
  };
  pendingMetadataSummary: {
    missingAuthorCount: number;
    missingCoverCount: number;
    missingDescriptionCount: number;
    missingAudioDurationCount: number;
    pendingRightsVerificationCount: number;
  };
  sourcesReport: BatchSourceScanResult[];
  sampleImportedEbooks: Array<{
    workId: string;
    assetId: string;
    title: string;
    author: string | null;
    mimeType: string;
    fileSize: number;
  }>;
  sampleImportedAudiobooks: Array<{
    workId: string;
    assetId: string;
    title: string;
    author: string | null;
    mimeType: string;
    fileSize: number;
  }>;
  errors: Array<{
    fileName: string;
    driveFileId: string;
    reason: string;
  }>;
}

const BATCH_REPORT_BUCKET = 'crt-drive-inventory';
const BATCH_REPORT_OBJECT = 'latest_batch_import_report_v1.json';

let latestBatchReportMemory: BatchImportProgressReport | null = null;

export function slugifyCatalogText(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140) || `obra-${Date.now()}`
  );
}

async function listDriveFolderChildrenPaginated(
  accessToken: string | null,
  apiKey: string,
  folderId: string
): Promise<{
  ok: boolean;
  httpStatus: number;
  errorMessage: string | null;
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    fileExtension?: string;
    md5Checksum?: string;
  }>;
}> {
  const collected: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    fileExtension?: string;
    md5Checksum?: string;
  }> = [];

  let pageToken: string | undefined;

  try {
    do {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set(
        'q',
        `'${folderId}' in parents and trashed = false`
      );
      url.searchParams.set(
        'fields',
        'nextPageToken,files(id,name,mimeType,size,fileExtension,md5Checksum)'
      );
      url.searchParams.set('pageSize', '1000');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      url.searchParams.set('supportsAllDrives', 'true');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      } else if (apiKey) {
        url.searchParams.set('key', apiKey);
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      const payload = (await res.json().catch(() => ({}))) as {
        nextPageToken?: string;
        files?: Array<{
          id: string;
          name: string;
          mimeType: string;
          size?: string;
          fileExtension?: string;
          md5Checksum?: string;
        }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        return {
          ok: false,
          httpStatus: res.status,
          errorMessage:
            payload?.error?.message ||
            `Erro HTTP ${res.status} ao acessar a pasta ${folderId} no Google Drive.`,
          files: [],
        };
      }

      if (Array.isArray(payload.files)) {
        collected.push(...payload.files);
      }
      pageToken = payload.nextPageToken || undefined;
    } while (pageToken);

    return {
      ok: true,
      httpStatus: 200,
      errorMessage: null,
      files: collected,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 500,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'Erro de conexão ao consultar Google Drive.',
      files: [],
    };
  }
}

async function scanSourceFolderForBatch(
  accessToken: string | null,
  apiKey: string,
  source: BatchSourceFolderConfig
): Promise<{
  scanSummary: BatchSourceScanResult;
  files: RawDriveFileNode[];
}> {
  const excludedBonusSubfolders: string[] = [];
  const rawFiles: RawDriveFileNode[] = [];

  const queue: Array<{ id: string; path: string }> = [
    { id: source.folderId, path: source.label },
  ];

  let rootStatus = 200;
  let rootError: string | null = null;
  let rootAccessible = true;

  while (queue.length > 0) {
    const batch = queue.splice(0, 10);
    const results = await Promise.all(
      batch.map(async (node) => ({
        node,
        res: await listDriveFolderChildrenPaginated(
          accessToken,
          apiKey,
          node.id
        ),
      }))
    );

    for (const { node, res } of results) {
      if (!res.ok) {
        if (node.id === source.folderId) {
          rootAccessible = false;
          rootStatus = res.httpStatus;
          rootError = res.errorMessage;
        }
        continue;
      }

      for (const item of res.files) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          if (
            EXCLUDED_SUPER_BONUS_FOLDER_IDS.has(item.id) ||
            isExcludedSuperBonusFolder(item.id, item.name || '')
          ) {
            excludedBonusSubfolders.push(`${item.name} (${item.id})`);
            continue;
          }
          queue.push({
            id: item.id,
            path: `${node.path}/${item.name}`,
          });
        } else {
          rawFiles.push({
            ...item,
            sourceKey: source.key,
            sourceLabel: source.label,
            folderPath: node.path,
          });
        }
      }
    }

    if (!rootAccessible) break;
  }

  let eligibleFilesCount = 0;
  let incompatibleOrCorruptedCount = 0;

  for (const f of rawFiles) {
    const sizeNum = Number(f.size) || 0;
    const ext = (
      f.fileExtension ||
      f.name.split('.').pop() ||
      ''
    ).toLowerCase();
    const mime = (f.mimeType || '').toLowerCase();

    if (source.targetType === 'ebook') {
      const isPdfOrEpub =
        ext === 'pdf' ||
        ext === 'epub' ||
        mime === 'application/pdf' ||
        mime === 'application/epub+zip';
      if (isPdfOrEpub && sizeNum > 10240) {
        eligibleFilesCount += 1;
      } else {
        incompatibleOrCorruptedCount += 1;
      }
    } else {
      const isMp3OrM4a =
        ext === 'mp3' ||
        ext === 'm4a' ||
        mime === 'audio/mpeg' ||
        mime === 'audio/x-m4a' ||
        mime === 'audio/mp4' ||
        mime === 'audio/m4a';
      if (isMp3OrM4a && sizeNum > 500000) {
        eligibleFilesCount += 1;
      } else {
        incompatibleOrCorruptedCount += 1;
      }
    }
  }

  const accessStatus: BatchSourceScanResult['accessStatus'] = !rootAccessible
    ? rootStatus === 401 || rootStatus === 403
      ? 'denied'
      : rootStatus === 404
      ? 'not_found'
      : 'error'
    : 'accessible';

  return {
    scanSummary: {
      key: source.key,
      label: source.label,
      folderId: source.folderId,
      url: source.url,
      targetType: source.targetType,
      accessStatus,
      httpStatus: rootStatus,
      errorMessage: rootError,
      totalFilesFound: rawFiles.length,
      eligibleFilesCount,
      incompatibleOrCorruptedCount,
      excludedBonusSubfolders,
    },
    files: rawFiles,
  };
}

/**
 * Pontua um ebook candidato para priorizar obras com metadados completos (Título + Autor real),
 * formato PDF compatível com o leitor interno e alinhamento temático ao CRT Books.
 */
function scoreEbookCandidate(params: {
  title: string;
  author: string | null;
  originalName: string;
  fileSize: number;
  hasIssues: boolean;
}): number {
  let score = 0;
  if (params.author && params.author.length >= 3) {
    score += 100;
  }
  if (!params.hasIssues) {
    score += 40;
  }
  if (params.fileSize >= 100 * 1024 && params.fileSize <= 25 * 1024 * 1024) {
    score += 20;
  }

  const text = `${params.title} ${params.author || ''}`.toLowerCase();
  const crtKeywords = [
    'mente',
    'mentalidade',
    'habito',
    'hábito',
    'foco',
    'disciplina',
    'dinheiro',
    'rico',
    'riqueza',
    'milionario',
    'milionário',
    'financ',
    'invest',
    'negoci',
    'vendas',
    'lider',
    'estrategia',
    'estratégia',
    'psicolog',
    'filosof',
    'estoic',
    'comunica',
    'persuas',
    'inteligencia',
    'inteligência',
    'emocional',
    'sucesso',
    'tempo',
    'produtiv',
    'sabedoria',
    'arte da',
    'poder',
    'crescimento',
    'pnl',
    'neurolingu',
    'ansiedade',
    'autoestima',
    'autoconhecimento',
    'proposito',
    'propósito',
    'carreira',
    'empreend',
    'gestao',
    'gestão',
    'decis',
    'cerebro',
    'cérebro',
    'dopamina',
    'atencao',
    'atenção',
    'carnegie',
    'napoleon hill',
    'goleman',
    'kiyosaki',
    'peterson',
    'greene',
    'cialdini',
    'duhigg',
    'clear',
    'kahneman',
    'taleb',
    'holiday',
    'seneca',
    'sêneca',
    'epicteto',
    'marco aurelio',
    'marco aurélio',
    'maquiavel',
    'sun tzu',
    'jung',
    'freud',
    'frankl',
    'cortella',
    'cury',
    'brunet',
    'nigro',
    'cerbasi',
    'bazin',
    'graham',
    'buffett',
    'munger',
    'dalio',
    'harari',
    'covey',
    'maxwell',
    'robbins',
    'tracy',
    'ekerv',
    'eker',
    'clason',
    'housel',
    'dweck',
    'newport',
    'pink',
    'sinek',
    'collins',
    ' Thiel',
    'musk',
    'jobs',
    'bezos',
    'knight',
    ' Walton',
  ];

  let matchedKwCount = 0;
  for (const kw of crtKeywords) {
    if (text.includes(kw.toLowerCase())) {
      matchedKwCount += 1;
    }
  }
  if (matchedKwCount > 0) {
    score += 120 + Math.min(matchedKwCount * 25, 100);
  }

  // Penaliza volumes intermediários de séries ou ficção de entretenimento
  if (/\b(vol\.?\s*\d+|volume\s*\d+|livro\s*[2-9]|parte\s*[2-9]|007)\b/i.test(params.title)) {
    score -= 120;
  }

  return score;
}

/**
 * Pontua um audiobook candidato para priorizar arquivos limpos (Título - Autor.mp3/.m4a),
 * sem sufixo (youtube) quando já houver versão de estúdio equivalente.
 */
function scoreAudioCandidate(params: {
  title: string;
  author: string | null;
  originalName: string;
  extension: string;
}): number {
  let score = 0;
  if (!/\(\s*youtube\s*\)/i.test(params.originalName)) {
    score += 200;
  }
  if (params.author && params.author.length >= 3) {
    score += 80;
  }
  if (params.extension === 'mp3') {
    score += 20;
  }
  if (!/\bparte\s*2\b/i.test(params.originalName)) {
    score += 15;
  }
  return score;
}

async function saveBatchReportToStorage(
  sb: SupabaseClient,
  report: BatchImportProgressReport
): Promise<void> {
  latestBatchReportMemory = report;
  try {
    const { data: buckets } = await sb.storage.listBuckets();
    const exists = (buckets || []).some(
      (b) => b.name === BATCH_REPORT_BUCKET || b.id === BATCH_REPORT_BUCKET
    );
    if (!exists) {
      await sb.storage.createBucket(BATCH_REPORT_BUCKET, {
        public: false,
        fileSizeLimit: 20 * 1024 * 1024,
      });
    }
    const jsonBuffer = Buffer.from(JSON.stringify(report, null, 2), 'utf-8');
    await sb.storage
      .from(BATCH_REPORT_BUCKET)
      .upload(BATCH_REPORT_OBJECT, jsonBuffer, {
        contentType: 'application/json',
        upsert: true,
      });
  } catch (err) {
    console.warn(
      '[CRT Batch Importer] Aviso ao salvar relatório de lote no storage privado:',
      err
    );
  }
}

export async function loadLatestBatchImportReport(
  sb: SupabaseClient
): Promise<BatchImportProgressReport | null> {
  if (latestBatchReportMemory) {
    return latestBatchReportMemory;
  }
  try {
    const res = await sb.storage
      .from(BATCH_REPORT_BUCKET)
      .download(BATCH_REPORT_OBJECT);
    if (res.error || !res.data) return null;
    const text = await res.data.text();
    const parsed = JSON.parse(text) as BatchImportProgressReport;
    latestBatchReportMemory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Executa a Importação em Lote da Fase 16:
 * - Preserva integralmente os 10 registros existentes e atualiza metadados faltantes quando houver correspondência confiável;
 * - Importa em lotes controlados (padrão: 50 itens por lote) até atingir a meta do catálogo principal:
 *   250 ebooks + 225 audiobooks = 475 obras únicas;
 * - Exclui os 3.500 ebooks extras (Super Bônus) e pacotes bônus;
 * - Mantém todas as obras novas em modo privado/restrito (status = 'draft', rights_status = 'pending');
 * - Não inventa autores, capas, descrições ou durações.
 */
export async function executePhase16BatchCatalogImport(params: {
  sb: SupabaseClient;
  accessToken: string | null;
  apiKey: string;
  batchSize?: number;
  targetEbooks?: number;
  targetAudiobooks?: number;
}): Promise<BatchImportProgressReport> {
  const {
    sb,
    accessToken,
    apiKey,
    batchSize = 50,
    targetEbooks = TARGET_EBOOK_CATALOG_COUNT,
    targetAudiobooks = TARGET_AUDIO_CATALOG_COUNT,
  } = params;

  const startedAt = new Date().toISOString();
  const runId = `batch-p16-${Date.now()}`;

  // 1. Carregar estado atual do catálogo no Supabase (works, assets, authors)
  const [
    { data: existingWorksRows, error: worksErr },
    { data: existingAssetsRows, error: assetsErr },
    { data: existingAuthorsRows, error: authorsErr },
  ] = await Promise.all([
    sb
      .from('works')
      .select(
        'id, title, slug, author_id, description, cover_url, status, rights_status'
      )
      .range(0, 4999),
    sb
      .from('assets')
      .select(
        'id, work_id, asset_type, source_type, drive_file_id, mime_type, file_size, duration_seconds, checksum, status'
      )
      .range(0, 4999),
    sb.from('authors').select('id, name, slug').range(0, 4999),
  ]);

  if (worksErr) {
    throw new Error(`Erro ao consultar works no Supabase: ${worksErr.message}`);
  }
  if (assetsErr) {
    throw new Error(
      `Erro ao consultar assets no Supabase: ${assetsErr.message}`
    );
  }
  if (authorsErr) {
    throw new Error(
      `Erro ao consultar authors no Supabase: ${authorsErr.message}`
    );
  }

  const worksList = Array.isArray(existingWorksRows) ? existingWorksRows : [];
  const assetsList = Array.isArray(existingAssetsRows)
    ? existingAssetsRows
    : [];
  const authorsList = Array.isArray(existingAuthorsRows)
    ? existingAuthorsRows
    : [];

  const existingEbookAssets = assetsList.filter(
    (a) => a.asset_type === 'ebook'
  );
  const existingAudioAssets = assetsList.filter(
    (a) => a.asset_type === 'audio'
  );

  const catalogBefore = {
    worksCount: worksList.length,
    ebooksCount: existingEbookAssets.length,
    audiobooksCount: existingAudioAssets.length,
    authorsCount: authorsList.length,
  };

  // Mapas de deduplicação e preservação dos registros existentes
  const authorIdBySlug = new Map<string, string>();
  for (const au of authorsList) {
    if (au.slug && au.id) {
      authorIdBySlug.set(String(au.slug).toLowerCase(), String(au.id));
    }
  }

  const workBySlug = new Map<
    string,
    {
      id: string;
      title: string;
      slug: string;
      author_id: string | null;
      cover_url: string | null;
      description: string | null;
    }
  >();
  const workByNormalizedTitle = new Map<
    string,
    {
      id: string;
      title: string;
      slug: string;
      author_id: string | null;
      cover_url: string | null;
      description: string | null;
    }
  >();

  for (const w of worksList) {
    const rec = {
      id: String(w.id),
      title: String(w.title),
      slug: String(w.slug),
      author_id: w.author_id ? String(w.author_id) : null,
      cover_url: w.cover_url ? String(w.cover_url) : null,
      description: w.description ? String(w.description) : null,
    };
    workBySlug.set(rec.slug.toLowerCase(), rec);
    const norm = normalizeTitleForComparison(rec.title);
    if (norm) {
      workByNormalizedTitle.set(norm, rec);
    }
  }

  const usedDriveFileIds = new Set<string>();
  const usedChecksums = new Set<string>();
  const usedWorkSlugs = new Set<string>();
  const usedNormalizedTitles = new Set<string>();

  for (const w of worksList) {
    if (w.slug) usedWorkSlugs.add(String(w.slug).toLowerCase());
    const norm = normalizeTitleForComparison(String(w.title || ''));
    if (norm) usedNormalizedTitles.add(norm);
  }
  for (const a of assetsList) {
    if (a.drive_file_id) usedDriveFileIds.add(String(a.drive_file_id).trim());
    if (a.checksum) usedChecksums.add(String(a.checksum).trim().toLowerCase());
  }

  // 2. Varrer as 5 pastas oficiais no Google Drive (2 Ebooks + 3 Audiobooks)
  const sourcesReport: BatchSourceScanResult[] = [];
  const rawEbookFiles: RawDriveFileNode[] = [];
  const rawAudioFiles: RawDriveFileNode[] = [];

  for (const src of PHASE16_EBOOK_SOURCES) {
    const { scanSummary, files } = await scanSourceFolderForBatch(
      accessToken,
      apiKey,
      src
    );
    sourcesReport.push(scanSummary);
    rawEbookFiles.push(...files);
  }

  for (const src of PHASE16_AUDIO_SOURCES) {
    const { scanSummary, files } = await scanSourceFolderForBatch(
      accessToken,
      apiKey,
      src
    );
    sourcesReport.push(scanSummary);
    rawAudioFiles.push(...files);
  }

  let updatedExistingWorksCount = 0;
  let createdAuthorsCount = 0;
  let skippedDuplicatesCount = 0;
  let skippedIncompatibleOrZeroSizeCount = 0;

  const ensureAuthorId = async (
    authorName: string | null
  ): Promise<string | null> => {
    if (!authorName || !authorName.trim()) return null;
    const cleanName = authorName.trim().slice(0, 120);
    const authorSlug = slugifyCatalogText(cleanName);
    if (!authorSlug) return null;

    const existingId = authorIdBySlug.get(authorSlug);
    if (existingId) return existingId;

    const { data: found } = await sb
      .from('authors')
      .select('id, slug')
      .eq('slug', authorSlug)
      .maybeSingle();

    if (found?.id) {
      authorIdBySlug.set(authorSlug, String(found.id));
      return String(found.id);
    }

    const { data: inserted, error: insErr } = await sb
      .from('authors')
      .insert({
        name: cleanName,
        slug: authorSlug,
      })
      .select('id')
      .single();

    if (!insErr && inserted?.id) {
      const newId = String(inserted.id);
      authorIdBySlug.set(authorSlug, newId);
      createdAuthorsCount += 1;
      return newId;
    }

    return null;
  };

  // 3. Preservar os registros existentes e atualizar quando houver correspondência confiável
  for (const asset of assetsList) {
    const parentWork = worksList.find((w) => w.id === asset.work_id);
    if (!parentWork) continue;
    const normWorkTitle = normalizeTitleForComparison(
      String(parentWork.title || '')
    );

    const pool = asset.asset_type === 'audio' ? rawAudioFiles : rawEbookFiles;
    const matchedDriveFile = pool.find((f) => {
      if (f.id === asset.drive_file_id) return true;
      if (
        asset.checksum &&
        f.md5Checksum &&
        f.md5Checksum.toLowerCase() === String(asset.checksum).toLowerCase()
      ) {
        return true;
      }
      const parsed = extractMetadataFromFilename(
        f.name,
        f.mimeType,
        f.fileExtension,
        f.folderPath
      );
      return (
        parsed.normalizedTitle &&
        normWorkTitle &&
        parsed.normalizedTitle === normWorkTitle
      );
    });

    if (matchedDriveFile) {
      if (matchedDriveFile.md5Checksum) {
        usedChecksums.add(matchedDriveFile.md5Checksum.toLowerCase());
      }
      usedDriveFileIds.add(matchedDriveFile.id);

      let didUpdate = false;
      if (!asset.checksum && matchedDriveFile.md5Checksum) {
        await sb
          .from('assets')
          .update({
            checksum: matchedDriveFile.md5Checksum,
            updated_at: new Date().toISOString(),
          })
          .eq('id', asset.id);
        didUpdate = true;
      }

      if (!parentWork.author_id) {
        const parsed = extractMetadataFromFilename(
          matchedDriveFile.name,
          matchedDriveFile.mimeType,
          matchedDriveFile.fileExtension,
          matchedDriveFile.folderPath
        );
        if (parsed.extractedAuthor) {
          const resolvedAuthorId = await ensureAuthorId(parsed.extractedAuthor);
          if (resolvedAuthorId) {
            await sb
              .from('works')
              .update({
                author_id: resolvedAuthorId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', parentWork.id);
            parentWork.author_id = resolvedAuthorId;
            didUpdate = true;
          }
        }
      }

      if (didUpdate) {
        updatedExistingWorksCount += 1;
      }
    }
  }

  // 4. Preparar candidatos elegíveis de AUDIOBOOKS (para atingir targetAudiobooks = 225)
  interface PreparedCandidate {
    targetType: 'ebook' | 'audio';
    driveFileId: string;
    originalName: string;
    mimeType: string;
    extension: string;
    fileSize: number;
    checksum: string | null;
    title: string;
    slug: string;
    normalizedTitle: string;
    author: string | null;
    score: number;
  }

  const audioCandidatesPool: PreparedCandidate[] = [];
  for (const f of rawAudioFiles) {
    const fileSize = Math.max(0, Number(f.size) || 0);
    const parsed = extractMetadataFromFilename(
      f.name || '',
      f.mimeType || '',
      f.fileExtension,
      f.folderPath
    );

    if (parsed.candidateType !== 'audio' || fileSize <= 500000) {
      skippedIncompatibleOrZeroSizeCount += 1;
      continue;
    }

    const cleanTitle = parsed.extractedTitle.trim();
    const normTitle = parsed.normalizedTitle;
    const slug = slugifyCatalogText(cleanTitle);

    if (!cleanTitle || !normTitle || normTitle.length < 2 || !slug) {
      skippedIncompatibleOrZeroSizeCount += 1;
      continue;
    }

    const normalizedMime =
      parsed.extension === 'm4a' ||
      (f.mimeType || '').toLowerCase().includes('m4a') ||
      (f.mimeType || '').toLowerCase().includes('mp4')
        ? 'audio/x-m4a'
        : 'audio/mpeg';

    audioCandidatesPool.push({
      targetType: 'audio',
      driveFileId: f.id,
      originalName: f.name,
      mimeType: normalizedMime,
      extension: parsed.extension || 'mp3',
      fileSize,
      checksum: f.md5Checksum || null,
      title: cleanTitle,
      slug,
      normalizedTitle: normTitle,
      author: parsed.extractedAuthor,
      score: scoreAudioCandidate({
        title: cleanTitle,
        author: parsed.extractedAuthor,
        originalName: f.name,
        extension: parsed.extension || 'mp3',
      }),
    });
  }

  audioCandidatesPool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, 'pt-BR');
  });

  const currentAudioCount = existingAudioAssets.length;
  const neededAudioCount = Math.max(0, targetAudiobooks - currentAudioCount);
  const selectedAudioToImport: PreparedCandidate[] = [];

  for (const cand of audioCandidatesPool) {
    if (selectedAudioToImport.length >= neededAudioCount) break;
    const lowerMd5 = cand.checksum ? cand.checksum.toLowerCase() : null;

    if (
      usedDriveFileIds.has(cand.driveFileId) ||
      (lowerMd5 && usedChecksums.has(lowerMd5)) ||
      usedWorkSlugs.has(cand.slug) ||
      usedNormalizedTitles.has(cand.normalizedTitle)
    ) {
      skippedDuplicatesCount += 1;
      continue;
    }

    usedDriveFileIds.add(cand.driveFileId);
    if (lowerMd5) usedChecksums.add(lowerMd5);
    usedWorkSlugs.add(cand.slug);
    usedNormalizedTitles.add(cand.normalizedTitle);
    selectedAudioToImport.push(cand);
  }

  // 5. Preparar candidatos elegíveis de EBOOKS (para atingir targetEbooks = 250)
  const ebookCandidatesPool: PreparedCandidate[] = [];
  for (const f of rawEbookFiles) {
    const fileSize = Math.max(0, Number(f.size) || 0);
    const parsed = extractMetadataFromFilename(
      f.name || '',
      f.mimeType || '',
      f.fileExtension,
      f.folderPath
    );

    // Somente PDFs/EPUBs válidos com tamanho > 10 KB entram como candidatos ao leitor
    if (
      parsed.candidateType !== 'ebook' ||
      parsed.extension !== 'pdf' ||
      fileSize <= 10240
    ) {
      skippedIncompatibleOrZeroSizeCount += 1;
      continue;
    }

    const cleanTitle = parsed.extractedTitle.trim();
    const normTitle = parsed.normalizedTitle;
    const slug = slugifyCatalogText(cleanTitle);

    if (!cleanTitle || !normTitle || normTitle.length < 3 || !slug) {
      skippedIncompatibleOrZeroSizeCount += 1;
      continue;
    }

    ebookCandidatesPool.push({
      targetType: 'ebook',
      driveFileId: f.id,
      originalName: f.name,
      mimeType: 'application/pdf',
      extension: 'pdf',
      fileSize,
      checksum: f.md5Checksum || null,
      title: cleanTitle,
      slug,
      normalizedTitle: normTitle,
      author: parsed.extractedAuthor,
      score: scoreEbookCandidate({
        title: cleanTitle,
        author: parsed.extractedAuthor,
        originalName: f.name,
        fileSize,
        hasIssues: parsed.issueFlags.length > 0,
      }),
    });
  }

  ebookCandidatesPool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, 'pt-BR');
  });

  const currentEbookCount = existingEbookAssets.length;
  const neededEbookCount = Math.max(0, targetEbooks - currentEbookCount);
  const selectedEbooksToImport: PreparedCandidate[] = [];

  for (const cand of ebookCandidatesPool) {
    if (selectedEbooksToImport.length >= neededEbookCount) break;
    const lowerMd5 = cand.checksum ? cand.checksum.toLowerCase() : null;

    if (
      usedDriveFileIds.has(cand.driveFileId) ||
      (lowerMd5 && usedChecksums.has(lowerMd5)) ||
      usedWorkSlugs.has(cand.slug) ||
      usedNormalizedTitles.has(cand.normalizedTitle)
    ) {
      skippedDuplicatesCount += 1;
      continue;
    }

    usedDriveFileIds.add(cand.driveFileId);
    if (lowerMd5) usedChecksums.add(lowerMd5);
    usedWorkSlugs.add(cand.slug);
    usedNormalizedTitles.add(cand.normalizedTitle);
    selectedEbooksToImport.push(cand);
  }

  // 6. Importar em lotes controlados com checkpoint e retomada segura
  const allToImport: PreparedCandidate[] = [
    ...selectedEbooksToImport,
    ...selectedAudioToImport,
  ];

  // Pré-resolver todos os autores únicos necessários para os itens selecionados em lote
  const uniqueAuthorsNeeded = Array.from(
    new Set(
      allToImport
        .map((i) => (i.author ? i.author.trim() : ''))
        .filter((a) => a.length >= 2)
    )
  );

  const missingAuthorsBySlug = new Map<
    string,
    { name: string; slug: string }
  >();
  for (const authorName of uniqueAuthorsNeeded) {
    const cleanName = authorName.trim().slice(0, 120);
    const authorSlug = slugifyCatalogText(cleanName);
    if (
      authorSlug &&
      !authorIdBySlug.has(authorSlug) &&
      !missingAuthorsBySlug.has(authorSlug)
    ) {
      missingAuthorsBySlug.set(authorSlug, {
        name: cleanName,
        slug: authorSlug,
      });
    }
  }

  const missingAuthorsList = Array.from(missingAuthorsBySlug.values());
  if (missingAuthorsList.length > 0) {
    for (let i = 0; i < missingAuthorsList.length; i += 100) {
      const chunk = missingAuthorsList.slice(i, i + 100);
      const { data: insertedAuthors, error: batchAuthErr } = await sb
        .from('authors')
        .insert(chunk)
        .select('id, slug');
      if (!batchAuthErr && Array.isArray(insertedAuthors)) {
        for (const au of insertedAuthors) {
          if (au.slug && au.id) {
            const s = String(au.slug).toLowerCase();
            if (!authorIdBySlug.has(s)) {
              createdAuthorsCount += 1;
            }
            authorIdBySlug.set(s, String(au.id));
          }
        }
      } else {
        for (const singleAu of chunk) {
          const resolvedId = await ensureAuthorId(singleAu.name);
          if (resolvedId) {
            authorIdBySlug.set(singleAu.slug.toLowerCase(), resolvedId);
          }
        }
      }
    }
  }

  const safeBatchSize = Math.max(10, Math.min(100, batchSize));
  const totalBatchesPlanned = Math.ceil(allToImport.length / safeBatchSize);
  let batchesCompleted = 0;
  let newlyImportedEbooksCount = 0;
  let newlyImportedAudiobooksCount = 0;
  let newlyCreatedWorksCount = 0;
  let newlyCreatedAssetsCount = 0;

  const sampleImportedEbooks: BatchImportProgressReport['sampleImportedEbooks'] =
    [];
  const sampleImportedAudiobooks: BatchImportProgressReport['sampleImportedAudiobooks'] =
    [];
  const errors: BatchImportProgressReport['errors'] = [];

  for (let offset = 0; offset < allToImport.length; offset += safeBatchSize) {
    const batchItems = allToImport.slice(offset, offset + safeBatchSize);

    // 6a. Inserir works do lote (já deduplicados em memória por slug e título normalizado)
    const workPayloads = batchItems.map((item) => {
      const authorSlug = item.author ? slugifyCatalogText(item.author) : '';
      const resolvedAuthorId = authorSlug
        ? authorIdBySlug.get(authorSlug) || null
        : null;
      return {
        title: item.title,
        slug: item.slug,
        author_id: resolvedAuthorId,
        description: null,
        cover_url: null,
        language: 'pt-BR',
        status: 'draft',
        rights_status: 'pending',
      };
    });

    const { data: insertedWorks, error: batchWorksErr } = await sb
      .from('works')
      .insert(workPayloads)
      .select('id, slug, title, author_id');

    if (batchWorksErr || !insertedWorks) {
      // Fallback item a item para isolar eventual falha sem perder o lote
      for (const item of batchItems) {
        try {
          const authorSlug = item.author ? slugifyCatalogText(item.author) : '';
          const resolvedAuthorId = authorSlug
            ? authorIdBySlug.get(authorSlug) || null
            : null;

          const { data: singleWork, error: singleWorkErr } = await sb
            .from('works')
            .insert({
              title: item.title,
              slug: item.slug,
              author_id: resolvedAuthorId,
              description: null,
              cover_url: null,
              language: 'pt-BR',
              status: 'draft',
              rights_status: 'pending',
            })
            .select('id, slug, title')
            .single();

          if (singleWorkErr || !singleWork?.id) {
            errors.push({
              fileName: item.originalName,
              driveFileId: item.driveFileId,
              reason:
                singleWorkErr?.message ||
                'Falha ao criar registro em public.works.',
            });
            continue;
          }

          newlyCreatedWorksCount += 1;

          const { data: singleAsset, error: singleAssetErr } = await sb
            .from('assets')
            .insert({
              work_id: singleWork.id,
              asset_type: item.targetType,
              source_type: 'google_drive',
              drive_file_id: item.driveFileId,
              mime_type: item.mimeType,
              file_size: item.fileSize,
              duration_seconds: 0,
              checksum: item.checksum,
              status: 'pending',
            })
            .select('id')
            .single();

          if (singleAssetErr || !singleAsset?.id) {
            errors.push({
              fileName: item.originalName,
              driveFileId: item.driveFileId,
              reason:
                singleAssetErr?.message ||
                'Falha ao criar registro em public.assets.',
            });
            continue;
          }

          newlyCreatedAssetsCount += 1;
          if (item.targetType === 'ebook') {
            newlyImportedEbooksCount += 1;
            if (sampleImportedEbooks.length < 15) {
              sampleImportedEbooks.push({
                workId: String(singleWork.id),
                assetId: String(singleAsset.id),
                title: item.title,
                author: item.author,
                mimeType: item.mimeType,
                fileSize: item.fileSize,
              });
            }
          } else {
            newlyImportedAudiobooksCount += 1;
            if (sampleImportedAudiobooks.length < 15) {
              sampleImportedAudiobooks.push({
                workId: String(singleWork.id),
                assetId: String(singleAsset.id),
                title: item.title,
                author: item.author,
                mimeType: item.mimeType,
                fileSize: item.fileSize,
              });
            }
          }
        } catch (itemErr) {
          errors.push({
            fileName: item.originalName,
            driveFileId: item.driveFileId,
            reason:
              itemErr instanceof Error ? itemErr.message : String(itemErr),
          });
        }
      }
      batchesCompleted += 1;
      continue;
    }

    const workIdBySlugMap = new Map<string, string>();
    for (const w of insertedWorks) {
      if (w.slug && w.id) {
        workIdBySlugMap.set(String(w.slug).toLowerCase(), String(w.id));
      }
    }

    newlyCreatedWorksCount += insertedWorks.length;

    const assetPayloads: Array<{
      work_id: string;
      asset_type: 'ebook' | 'audio';
      source_type: 'google_drive';
      drive_file_id: string;
      mime_type: string;
      file_size: number;
      duration_seconds: number;
      checksum: string | null;
      status: 'pending';
    }> = [];

    const itemByDriveIdInBatch = new Map<string, PreparedCandidate>();

    for (const item of batchItems) {
      const workId = workIdBySlugMap.get(item.slug.toLowerCase());
      if (!workId) {
        errors.push({
          fileName: item.originalName,
          driveFileId: item.driveFileId,
          reason: 'work_id não encontrado após upsert do lote.',
        });
        continue;
      }
      itemByDriveIdInBatch.set(item.driveFileId, item);
      assetPayloads.push({
        work_id: workId,
        asset_type: item.targetType,
        source_type: 'google_drive',
        drive_file_id: item.driveFileId,
        mime_type: item.mimeType,
        file_size: item.fileSize,
        duration_seconds: 0,
        checksum: item.checksum,
        status: 'pending',
      });
    }

    if (assetPayloads.length > 0) {
      const { data: insertedAssets, error: batchAssetsErr } = await sb
        .from('assets')
        .insert(assetPayloads)
        .select('id, work_id, asset_type, drive_file_id, mime_type, file_size');

      if (batchAssetsErr || !insertedAssets) {
        for (const payload of assetPayloads) {
          const item = itemByDriveIdInBatch.get(payload.drive_file_id);
          const { data: singleAsset, error: singleErr } = await sb
            .from('assets')
            .insert(payload)
            .select('id')
            .single();
          if (singleErr || !singleAsset?.id) {
            errors.push({
              fileName: item?.originalName || payload.drive_file_id,
              driveFileId: payload.drive_file_id,
              reason:
                singleErr?.message || 'Erro ao inserir asset individualmente.',
            });
          } else {
            newlyCreatedAssetsCount += 1;
            if (payload.asset_type === 'ebook') {
              newlyImportedEbooksCount += 1;
            } else {
              newlyImportedAudiobooksCount += 1;
            }
          }
        }
      } else {
        newlyCreatedAssetsCount += insertedAssets.length;
        for (const a of insertedAssets) {
          const item = itemByDriveIdInBatch.get(String(a.drive_file_id));
          if (a.asset_type === 'ebook') {
            newlyImportedEbooksCount += 1;
            if (item && sampleImportedEbooks.length < 15) {
              sampleImportedEbooks.push({
                workId: String(a.work_id),
                assetId: String(a.id),
                title: item.title,
                author: item.author,
                mimeType: String(a.mime_type),
                fileSize: Number(a.file_size) || 0,
              });
            }
          } else {
            newlyImportedAudiobooksCount += 1;
            if (item && sampleImportedAudiobooks.length < 15) {
              sampleImportedAudiobooks.push({
                workId: String(a.work_id),
                assetId: String(a.id),
                title: item.title,
                author: item.author,
                mimeType: String(a.mime_type),
                fileSize: Number(a.file_size) || 0,
              });
            }
          }
        }
      }
    }

    batchesCompleted += 1;
  }

  // 7. Consultar contagens reais pós-importação no banco
  const [
    { data: finalWorks },
    { data: finalAssets },
    { data: finalAuthors },
  ] = await Promise.all([
    sb
      .from('works')
      .select('id, author_id, cover_url, description, rights_status')
      .range(0, 4999),
    sb
      .from('assets')
      .select('id, asset_type, duration_seconds')
      .range(0, 4999),
    sb.from('authors').select('id').range(0, 4999),
  ]);

  const finalWorksArr = Array.isArray(finalWorks) ? finalWorks : [];
  const finalAssetsArr = Array.isArray(finalAssets) ? finalAssets : [];
  const finalAuthorsArr = Array.isArray(finalAuthors) ? finalAuthors : [];

  const finalEbooksCount = finalAssetsArr.filter(
    (a) => a.asset_type === 'ebook'
  ).length;
  const finalAudiobooksCount = finalAssetsArr.filter(
    (a) => a.asset_type === 'audio'
  ).length;

  const missingAuthorCount = finalWorksArr.filter((w) => !w.author_id).length;
  const missingCoverCount = finalWorksArr.filter((w) => !w.cover_url).length;
  const missingDescriptionCount = finalWorksArr.filter(
    (w) => !w.description
  ).length;
  const missingAudioDurationCount = finalAssetsArr.filter(
    (a) => a.asset_type === 'audio' && (!a.duration_seconds || a.duration_seconds <= 0)
  ).length;
  const pendingRightsVerificationCount = finalWorksArr.filter(
    (w) => w.rights_status === 'pending'
  ).length;

  const completedAt = new Date().toISOString();

  const report: BatchImportProgressReport = {
    runId,
    startedAt,
    completedAt,
    status: errors.length === 0 ? 'completed' : 'partial',
    batchSize: safeBatchSize,
    totalBatchesPlanned,
    batchesCompleted,
    targets: {
      ebooksTarget: targetEbooks,
      audiobooksTarget: targetAudiobooks,
      totalTarget: targetEbooks + targetAudiobooks,
    },
    catalogBefore,
    catalogAfter: {
      worksCount: finalWorksArr.length,
      ebooksCount: finalEbooksCount,
      audiobooksCount: finalAudiobooksCount,
      authorsCount: finalAuthorsArr.length,
    },
    executionSummary: {
      preservedExistingWorksCount: catalogBefore.worksCount,
      updatedExistingWorksCount,
      newlyImportedEbooksCount,
      newlyImportedAudiobooksCount,
      newlyCreatedWorksCount,
      newlyCreatedAssetsCount,
      newlyCreatedAuthorsCount: createdAuthorsCount,
      skippedDuplicatesCount,
      skippedIncompatibleOrZeroSizeCount,
      failedItemsCount: errors.length,
    },
    pendingMetadataSummary: {
      missingAuthorCount,
      missingCoverCount,
      missingDescriptionCount,
      missingAudioDurationCount,
      pendingRightsVerificationCount,
    },
    sourcesReport,
    sampleImportedEbooks,
    sampleImportedAudiobooks,
    errors,
  };

  await saveBatchReportToStorage(sb, report);
  return report;
}
