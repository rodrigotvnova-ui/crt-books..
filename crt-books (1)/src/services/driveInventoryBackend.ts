import { SupabaseClient } from '@supabase/supabase-js';
import zlib from 'zlib';

export type InventorySourceKey =
  | 'ebooks_main'
  | 'ebooks'
  | 'audiobooks'
  | 'audiobooks_2'
  | 'audiobooks_3'
  | 'additional_analysis';

export type InventoryCandidateType = 'ebook' | 'audio' | 'unsupported';

export interface InventoryOriginDefinition {
  key: InventorySourceKey;
  folderId: string;
  label: string;
  url: string;
  importMode: 'candidate' | 'analysis_only';
  importAllowed: boolean;
}

export const OFFICIAL_INVENTORY_ORIGINS: readonly InventoryOriginDefinition[] = [
  {
    key: 'ebooks_main',
    folderId: '1KgyMW0W9e_7PqYn51o36FgW-hXH54AGU',
    label: 'Ebooks Fonte 1 (Canal Enriquecendo a Mente)',
    url: 'https://drive.google.com/drive/folders/1KgyMW0W9e_7PqYn51o36FgW-hXH54AGU',
    importMode: 'candidate',
    importAllowed: true,
  },
  {
    key: 'ebooks',
    folderId: '1JOSnganIK08JXrc7k-fTecucb5bPqv1t',
    label: 'Ebooks Fonte 2 (Biblioteca LP Ebooks)',
    url: 'https://drive.google.com/drive/folders/1JOSnganIK08JXrc7k-fTecucb5bPqv1t',
    importMode: 'candidate',
    importAllowed: true,
  },
  {
    key: 'audiobooks',
    folderId: '1HjOIzbvYW9LoZhq9DsIaAznspLKaec1I',
    label: 'Audiobooks Fonte 1 (Audiolivros Principal)',
    url: 'https://drive.google.com/drive/folders/1HjOIzbvYW9LoZhq9DsIaAznspLKaec1I',
    importMode: 'candidate',
    importAllowed: true,
  },
  {
    key: 'audiobooks_2',
    folderId: '1-6gsrxIJVE9k4eEBVSWEnloFKZQ56_ap',
    label: 'Audiobooks Fonte 2 (Acervo AudioBook)',
    url: 'https://drive.google.com/drive/folders/1-6gsrxIJVE9k4eEBVSWEnloFKZQ56_ap',
    importMode: 'candidate',
    importAllowed: true,
  },
  {
    key: 'audiobooks_3',
    folderId: '1RI9d8lkulu66QiRGrd35h7_vs2ak_350',
    label: 'Audiobooks Fonte 3 (LP Audiobooks)',
    url: 'https://drive.google.com/drive/folders/1RI9d8lkulu66QiRGrd35h7_vs2ak_350',
    importMode: 'candidate',
    importAllowed: true,
  },
  {
    key: 'additional_analysis',
    folderId: '1Ldc5MT65nU6BfS8eTZguPnWORZjaCS1X',
    label: 'Acervo adicional para análise (sem importação automática)',
    url: 'https://drive.google.com/drive/folders/1Ldc5MT65nU6BfS8eTZguPnWORZjaCS1X',
    importMode: 'analysis_only',
    importAllowed: false,
  },
] as const;

export const EXCLUDED_SUPER_BONUS_FOLDER_IDS = new Set<string>([
  '1OHnD7aawLwoEayGQ9dga1bJuPEJoT10k',
  '1yBHMprzXffCzfKjSfip7od4F4da9rgYl',
  '1PzmUoeY0iBlxU2wt9U23I-wbzrbXupIn',
  '17DIxr088OQG0f-bVH0ilFrWPrRD7oyDz',
]);

export interface ExcludedFolderRecord {
  folderId: string;
  folderName: string;
  folderPath: string;
  reason: string;
}

export interface SubfolderBreakdownRecord {
  subpath: string;
  totalFiles: number;
  ebookCount: number;
  pdfCount: number;
  epubCount: number;
  audioCount: number;
  mp3Count: number;
  m4aCount: number;
  unsupportedCount: number;
}

export interface DriveInventorySourceSummary {
  sourceKey: InventorySourceKey;
  folderId: string;
  folderLabel: string;
  folderDriveName: string | null;
  folderUrl: string;
  importMode: 'candidate' | 'analysis_only';
  accessStatus: 'accessible' | 'denied' | 'not_found' | 'error' | 'pending';
  httpStatus: number | null;
  errorMessage: string | null;
  foldersScanned: number;
  totalFiles: number;
  ebookCount: number;
  pdfCount: number;
  epubCount: number;
  audioCount: number;
  mp3Count: number;
  m4aCount: number;
  unsupportedCount: number;
  extensionsBreakdown: Record<string, number>;
  duplicateIdCount: number;
  alreadyInCatalogCount: number;
  duplicateTitleCount: number;
  problemCount: number;
  excludedFolders: ExcludedFolderRecord[];
  subfoldersBreakdown: SubfolderBreakdownRecord[];
  lastScannedAt: string | null;
}

export interface DriveInventoryItemRecord {
  id: string;
  run_id: string;
  source_folder_key: InventorySourceKey;
  source_root_folder_id: string;
  source_folder_label: string;
  parent_folder_id: string;
  folder_path: string;
  top_subfolder_label: string;
  drive_file_id: string;
  original_name: string;
  extension: string;
  mime_type: string;
  file_size: number;
  md5_checksum: string | null;
  extracted_title: string;
  extracted_author: string | null;
  normalized_title: string;
  candidate_type: InventoryCandidateType;
  is_duplicate_id: boolean;
  already_in_catalog_assets: boolean;
  is_possible_duplicate_title: boolean;
  duplicate_group_size: number;
  has_issues: boolean;
  issue_flags: string[];
  is_private: true;
  rights_status: 'pending';
  import_allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DuplicateTitleGroupSummary {
  normalizedTitle: string;
  sampleTitle: string;
  count: number;
  sources: string[];
  extensions: string[];
  sampleFiles: Array<{
    driveFileId: string;
    originalName: string;
    sourceKey: InventorySourceKey;
    folderPath: string;
    extension: string;
    fileSize: number;
  }>;
}

export interface DriveInventoryRunReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'completed' | 'partial' | 'failed';
  storageMode: 'postgres_tables' | 'supabase_private_storage';
  postgresTablesReady: boolean;
  totals: {
    totalFiles: number;
    foldersScanned: number;
    ebookCandidates: number;
    pdfCount: number;
    epubCount: number;
    audioCandidates: number;
    mp3Count: number;
    m4aCount: number;
    unsupportedFiles: number;
    duplicateIdCount: number;
    alreadyInCatalogCount: number;
    possibleDuplicateTitleFilesCount: number;
    possibleDuplicateTitleGroupsCount: number;
    problemFilesCount: number;
    excludedSuperBonusFoldersCount: number;
    byExtension: Record<string, number>;
    issuesBreakdown: Record<string, number>;
  };
  sources: DriveInventorySourceSummary[];
  topDuplicateGroups: DuplicateTitleGroupSummary[];
}

interface StoredInventoryState {
  version: number;
  report: DriveInventoryRunReport;
  items: DriveInventoryItemRecord[];
}

const INVENTORY_BUCKET = 'crt-drive-inventory';
const INVENTORY_REPORT_OBJECT = 'latest_inventory_report_v1.json';
const INVENTORY_ITEMS_GZ_OBJECT = 'latest_inventory_items_v1.json.gz';

let cachedInventoryState: StoredInventoryState | null = null;

function makeDeterministicUuid(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x12345678;
  let h4 = 0x9abcdef0;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2166136261) >>> 0;
    h3 = (h3 * 31 + c) >>> 0;
    h4 = (h4 * 33 ^ c) >>> 0;
  }
  const p1 = h1.toString(16).padStart(8, '0');
  const p2 = h2.toString(16).padStart(8, '0');
  const p3 = h3.toString(16).padStart(8, '0');
  const p4 = h4.toString(16).padStart(8, '0');
  return `${p1}-${p2.slice(0, 4)}-4${p2.slice(5, 8)}-8${p3.slice(1, 4)}-${p3.slice(4, 8)}${p4}`;
}

export function isExcludedSuperBonusFolder(
  folderId: string,
  folderName: string
): boolean {
  if (EXCLUDED_SUPER_BONUS_FOLDER_IDS.has(folderId.trim())) {
    return true;
  }
  const clean = folderName.trim();
  if (/super\s*b[oô]nus/i.test(clean)) {
    return true;
  }
  if (/3[.,]?500\s*(livros|ebooks)/i.test(clean)) {
    return true;
  }
  if (/10\s*mil\s*(para\s*kindle|livros)/i.test(clean)) {
    return true;
  }
  return false;
}

export function normalizeTitleForComparison(rawTitle: string): string {
  return rawTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(oficial|z-lib\.org|z-liborg|zlib|by|vol\.?\s*\d+|ed\.?\s*\d+)\b/g, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractMetadataFromFilename(
  originalName: string,
  mimeType: string,
  rawFileExtension?: string,
  folderPath?: string
): {
  extension: string;
  candidateType: InventoryCandidateType;
  extractedTitle: string;
  extractedAuthor: string | null;
  normalizedTitle: string;
  issueFlags: string[];
} {
  const trimmedName = String(originalName || '').trim();
  const dotMatch = trimmedName.match(/\.([a-zA-Z0-9]{1,8})$/);
  const extFromName = dotMatch ? dotMatch[1].toLowerCase() : '';
  const extension = (rawFileExtension || extFromName || '').toLowerCase();
  const cleanMime = String(mimeType || '').trim().toLowerCase();

  let candidateType: InventoryCandidateType = 'unsupported';
  if (
    extension === 'pdf' ||
    extension === 'epub' ||
    cleanMime === 'application/pdf' ||
    cleanMime === 'application/epub+zip'
  ) {
    candidateType = 'ebook';
  } else if (
    extension === 'mp3' ||
    extension === 'm4a' ||
    cleanMime === 'audio/mpeg' ||
    cleanMime === 'audio/mp4' ||
    cleanMime === 'audio/x-m4a' ||
    cleanMime === 'audio/m4a'
  ) {
    candidateType = 'audio';
  }

  const issueFlags: string[] = [];

  if (candidateType === 'unsupported') {
    issueFlags.push('UNSUPPORTED_FORMAT');
  }

  const withoutExt = dotMatch
    ? trimmedName.slice(0, trimmedName.length - dotMatch[0].length).trim()
    : trimmedName;

  // Detecta marcadores suspeitos de cópia ou origem no nome do arquivo
  if (
    /\(\s*\d+\s*\)/.test(withoutExt) ||
    /\b(z-lib|zlib|z-liborg|copia|cópia)\b/i.test(withoutExt) ||
    /_{2,}/.test(withoutExt)
  ) {
    issueFlags.push('SUSPICIOUS_FILENAME');
  }

  // Limpa sufixos de cópia e tags de canal (youtube) antes de extrair título e autor
  const strippedYoutube = withoutExt
    .replace(/\s*[-–—]\s*[^-–—]+\(\s*youtube\s*\)\s*$/i, '')
    .replace(/\(\s*youtube\s*\)/gi, '')
    .replace(/[🎧📚🗣🔥✨]/g, ' ')
    .replace(/#[a-zA-Z0-9_À-ÿ]+/g, ' ')
    .replace(/\(\s*(?:resumo\s*audiobook|audiobook\s*completo|videobook\s*ilustrado)\s*\)/gi, ' ')
    .replace(/\b(?:audiobook\s*completo(?:\s*em\s*portugu[eê]s)?(?:\s*pt-br)?|audiolivro\s*completo(?:\s*em\s*portugu[eê]s)?(?:\s*pt-br)?|audiobook\s*do\s*livro\s*completo|voz\s*humana|narra[cç][aã]o\s*profissional|[aá]udio\s*livro|audiolivro|audiobook)\b/gi, ' ')
    .replace(/\bCOMPLETO!\s*/gi, ' ');

  const cleanedBase = strippedYoutube
    .replace(/\(\s*(?:oficial|\d+)\s*\)/gi, ' ')
    .replace(/[-_\s]*\b(?:z-liborg|z-lib\.org|zlib)\b[-_\s]*/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .trim();

  let extractedTitle = cleanedBase;
  let extractedAuthor: string | null = null;

  const lastFolderSegment = folderPath
    ? folderPath.split('/').filter(Boolean).pop()?.trim() || ''
    : '';
  const normalizedLastFolder = normalizeTitleForComparison(lastFolderSegment);

  // Padrões comuns: "Título - Autor", "Autor - Título" (quando subpasta = Autor) ou "Título by Autor"
  const dashParts = cleanedBase
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (dashParts.length >= 2) {
    const firstPart = dashParts[0];
    const lastPart = dashParts[dashParts.length - 1];
    const firstPartsJoined = dashParts.slice(0, -1).join(' - ').trim();
    const restPartsJoined = dashParts.slice(1).join(' - ').trim();

    if (
      normalizedLastFolder &&
      normalizedLastFolder.length >= 4 &&
      normalizeTitleForComparison(firstPart) === normalizedLastFolder &&
      restPartsJoined.length >= 2
    ) {
      // Subpasta tem o nome do autor e o arquivo segue "Autor - Título"
      extractedAuthor = firstPart;
      extractedTitle = restPartsJoined;
    } else if (
      /^parte\s+\d+(?:\s+de\s+\d+)?$/i.test(lastPart) &&
      dashParts.length >= 3
    ) {
      // Ex: "12 Regras para a Vida - Jordan B. Peterson - Parte 1 de 2"
      extractedTitle = `${dashParts[0]} (${lastPart})`;
      extractedAuthor = dashParts.slice(1, -1).join(' - ').trim() || null;
    } else if (
      /^parte\s+\d+(?:\s+de\s+\d+)?$/i.test(dashParts[1]) &&
      dashParts.length >= 3
    ) {
      // Ex: "12 regras para a vida - Parte 1 de 2 - Jordan B. Peterson"
      extractedTitle = `${dashParts[0]} (${dashParts[1]})`;
      extractedAuthor = dashParts.slice(2).join(' - ').trim() || null;
    } else if (firstPartsJoined.length >= 2 && lastPart.length >= 2) {
      const suspiciousAuthorPattern =
        /\b(livro\s*sonoro|sussurros\s*de\s*tinta|mundo\s*em\s*audio|descobrindo\s*livros|ondabook|vozes\s*liter[aá]rias|audio\s*livros|my\s*audiobook|caminhos\s*da\s*sabedoria|audiobooks?\s*cl[aá]ssicos|audiobook\s*no\s*ouvido|the\s*audiobook|portugu[eê]s|lideran[cç]a|parte\s*\d+)\b/i;
      if (suspiciousAuthorPattern.test(lastPart)) {
        extractedTitle = dashParts[0];
        const secondPart = dashParts.length >= 2 ? dashParts[1] : '';
        if (
          secondPart &&
          !suspiciousAuthorPattern.test(secondPart) &&
          secondPart.length >= 3 &&
          secondPart.length <= 60
        ) {
          extractedAuthor = secondPart;
        } else {
          extractedAuthor = null;
        }
      } else {
        extractedTitle = firstPartsJoined;
        extractedAuthor = lastPart;
      }
    }
  } else {
    const byMatch = cleanedBase.match(/^(.+?)\s+by[-\s]+([a-zA-ZÀ-ÿ\s.-]+)$/i);
    if (byMatch && byMatch[1]?.trim() && byMatch[2]?.trim()) {
      extractedTitle = byMatch[1].trim();
      extractedAuthor = byMatch[2].replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      const deMatch = cleanedBase.match(
        /^(.+?),\s+de\s+([A-ZÀ-Ý][a-zA-ZÀ-ÿ\s.'-]{2,50})$/
      );
      if (deMatch && deMatch[1]?.trim() && deMatch[2]?.trim()) {
        extractedTitle = deMatch[1].trim();
        extractedAuthor = deMatch[2].trim();
      }
    }
  }

  if (!extractedAuthor) {
    issueFlags.push('MISSING_AUTHOR');
  }

  if (
    !extractedTitle ||
    extractedTitle.length < 3 ||
    /^(novo documento|documento|prompt|sem titulo|livro|ebook|audio|\d+)$/i.test(
      extractedTitle.trim()
    )
  ) {
    issueFlags.push('INCOMPLETE_TITLE');
  }

  const normalizedTitle =
    normalizeTitleForComparison(extractedTitle) ||
    normalizeTitleForComparison(withoutExt) ||
    trimmedName.toLowerCase();

  return {
    extension: extension || 'unknown',
    candidateType,
    extractedTitle: extractedTitle || withoutExt || trimmedName,
    extractedAuthor,
    normalizedTitle,
    issueFlags,
  };
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | number;
  fileExtension?: string;
  md5Checksum?: string;
}

async function fetchDriveFolderMetadata(
  accessToken: string | null,
  apiKey: string,
  folderId: string
): Promise<{
  ok: boolean;
  httpStatus: number;
  folderName: string | null;
  errorMessage: string | null;
}> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`
  );
  url.searchParams.set('fields', 'id,name,mimeType');
  url.searchParams.set('supportsAllDrives', 'true');

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (apiKey) {
    url.searchParams.set('key', apiKey);
  }

  try {
    const res = await fetch(url.toString(), { method: 'GET', headers });
    const payload = (await res.json().catch(() => ({}))) as {
      name?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        folderName: null,
        errorMessage:
          payload?.error?.message ||
          `Sem acesso ou erro ao consultar pasta no Google Drive (HTTP ${res.status}).`,
      };
    }
    return {
      ok: true,
      httpStatus: res.status,
      folderName: payload?.name || null,
      errorMessage: null,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 500,
      folderName: null,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'Exceção de rede ao consultar pasta no Google Drive.',
    };
  }
}

/**
 * Lista TODOS os filhos diretos de uma pasta do Google Drive de forma paginada (nextPageToken),
 * sem qualquer limite artificial de 100 arquivos (usa pageSize = 1000 + loop até nextPageToken vazio).
 */
async function listAllDriveChildrenPaginated(
  accessToken: string | null,
  apiKey: string,
  folderId: string
): Promise<{
  ok: boolean;
  httpStatus: number;
  errorMessage: string | null;
  files: RawDriveFile[];
}> {
  const allFiles: RawDriveFile[] = [];
  let pageToken = '';

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    do {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set(
        'q',
        `'${folderId}' in parents and trashed = false`
      );
      url.searchParams.set(
        'fields',
        'nextPageToken, files(id,name,mimeType,size,fileExtension,md5Checksum)'
      );
      url.searchParams.set('pageSize', '1000');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      url.searchParams.set('supportsAllDrives', 'true');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      if (!accessToken && apiKey) {
        url.searchParams.set('key', apiKey);
      }

      const res = await fetch(url.toString(), { method: 'GET', headers });
      const payload = (await res.json().catch(() => ({}))) as {
        nextPageToken?: string;
        files?: RawDriveFile[];
        error?: { message?: string };
      };

      if (!res.ok) {
        return {
          ok: false,
          httpStatus: res.status,
          errorMessage:
            payload?.error?.message ||
            `Falha ao listar arquivos da pasta ${folderId} (HTTP ${res.status}).`,
          files: allFiles,
        };
      }

      if (Array.isArray(payload.files)) {
        allFiles.push(...payload.files);
      }
      pageToken = payload.nextPageToken || '';
    } while (pageToken);

    return {
      ok: true,
      httpStatus: 200,
      errorMessage: null,
      files: allFiles,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 500,
      errorMessage:
        err instanceof Error
          ? err.message
          : `Exceção ao listar arquivos da pasta ${folderId}.`,
      files: allFiles,
    };
  }
}

async function checkPostgresInventoryTablesAvailable(
  sb: SupabaseClient
): Promise<boolean> {
  const { error } = await sb
    .from('drive_inventory_items')
    .select('id')
    .limit(1);
  return !error;
}

async function ensureInventoryBucket(sb: SupabaseClient): Promise<void> {
  const { data: buckets } = await sb.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === INVENTORY_BUCKET);
  if (!exists) {
    await sb.storage.createBucket(INVENTORY_BUCKET, {
      public: false,
    });
  }
}

async function saveInventoryToPrivateStorage(
  sb: SupabaseClient,
  state: StoredInventoryState
): Promise<void> {
  cachedInventoryState = state;
  await ensureInventoryBucket(sb);

  const reportBuffer = Buffer.from(
    JSON.stringify(state.report, null, 2),
    'utf-8'
  );
  const itemsGzBuffer = zlib.gzipSync(
    Buffer.from(JSON.stringify(state.items), 'utf-8')
  );

  await Promise.all([
    sb.storage
      .from(INVENTORY_BUCKET)
      .upload(INVENTORY_REPORT_OBJECT, reportBuffer, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '0',
      }),
    sb.storage
      .from(INVENTORY_BUCKET)
      .upload(INVENTORY_ITEMS_GZ_OBJECT, itemsGzBuffer, {
        contentType: 'application/gzip',
        upsert: true,
        cacheControl: '0',
      }),
  ]);
}

export async function loadStoredInventoryState(
  sb: SupabaseClient
): Promise<StoredInventoryState | null> {
  if (cachedInventoryState) {
    return cachedInventoryState;
  }

  try {
    await ensureInventoryBucket(sb);
    const [reportDownload, itemsDownload] = await Promise.all([
      sb.storage.from(INVENTORY_BUCKET).download(INVENTORY_REPORT_OBJECT),
      sb.storage.from(INVENTORY_BUCKET).download(INVENTORY_ITEMS_GZ_OBJECT),
    ]);

    if (
      reportDownload.error ||
      !reportDownload.data ||
      itemsDownload.error ||
      !itemsDownload.data
    ) {
      return null;
    }

    const reportText = await reportDownload.data.text();
    const report = JSON.parse(reportText) as DriveInventoryRunReport;

    const gzArrayBuffer = await itemsDownload.data.arrayBuffer();
    const unzippedBuffer = zlib.gunzipSync(Buffer.from(gzArrayBuffer));
    const items = JSON.parse(
      unzippedBuffer.toString('utf-8')
    ) as DriveInventoryItemRecord[];

    cachedInventoryState = {
      version: 1,
      report,
      items,
    };
    return cachedInventoryState;
  } catch (err) {
    console.warn(
      '[CRT Inventory] Aviso ao carregar inventário salvo no Supabase Storage:',
      err
    );
    return null;
  }
}

/**
 * Executa o inventário completo e paginado das 3 origens no Google Drive,
 * excluindo a pasta Super Bônus de 3.500 livros, sem alterar obras/assets existentes
 * e persistindo de forma idempotente no Supabase.
 */
export async function executeDriveInventoryScan(params: {
  sb: SupabaseClient;
  accessToken: string | null;
  apiKey: string;
}): Promise<StoredInventoryState> {
  const { sb, accessToken, apiKey } = params;
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const runId = makeDeterministicUuid(`crt-inventory-run-${startedAt}`);

  // Consultar drive_file_id já existentes em public.assets (somente leitura, sem modificar public.works ou public.assets)
  const existingCatalogDriveIds = new Set<string>();
  try {
    const { data: existingAssets } = await sb
      .from('assets')
      .select('drive_file_id');
    if (Array.isArray(existingAssets)) {
      for (const row of existingAssets as Array<{ drive_file_id?: string | null }>) {
        if (row.drive_file_id) {
          existingCatalogDriveIds.add(String(row.drive_file_id).trim());
        }
      }
    }
  } catch {
    // ignora falha opcional
  }

  const sourcesSummary: DriveInventorySourceSummary[] = [];
  const allItems: DriveInventoryItemRecord[] = [];

  for (const origin of OFFICIAL_INVENTORY_ORIGINS) {
    const metaCheck = await fetchDriveFolderMetadata(
      accessToken,
      apiKey,
      origin.folderId
    );

    if (!metaCheck.ok) {
      const accessStatus =
        metaCheck.httpStatus === 403 || metaCheck.httpStatus === 401
          ? 'denied'
          : metaCheck.httpStatus === 404
          ? 'not_found'
          : 'error';

      sourcesSummary.push({
        sourceKey: origin.key,
        folderId: origin.folderId,
        folderLabel: origin.label,
        folderDriveName: null,
        folderUrl: origin.url,
        importMode: origin.importMode,
        accessStatus,
        httpStatus: metaCheck.httpStatus,
        errorMessage: metaCheck.errorMessage,
        foldersScanned: 0,
        totalFiles: 0,
        ebookCount: 0,
        pdfCount: 0,
        epubCount: 0,
        audioCount: 0,
        mp3Count: 0,
        m4aCount: 0,
        unsupportedCount: 0,
        extensionsBreakdown: {},
        duplicateIdCount: 0,
        alreadyInCatalogCount: 0,
        duplicateTitleCount: 0,
        problemCount: 0,
        excludedFolders: [],
        subfoldersBreakdown: [],
        lastScannedAt: new Date().toISOString(),
      });
      continue;
    }

    // BFS paralelo paginado para percorrer todas as pastas e subpastas sem limite de 100 arquivos
    const excludedFolders: ExcludedFolderRecord[] = [];
    let foldersScanned = 0;
    let folderError: { httpStatus: number; message: string } | null = null;

    interface FolderQueueNode {
      id: string;
      path: string;
      topSubfolderLabel: string;
    }

    const queue: FolderQueueNode[] = [
      {
        id: origin.folderId,
        path: origin.label,
        topSubfolderLabel: `${origin.label} (Raiz)`,
      },
    ];

    const rawOriginFiles: Array<{
      file: RawDriveFile;
      parentFolderId: string;
      folderPath: string;
      topSubfolderLabel: string;
    }> = [];

    while (queue.length > 0) {
      const batch = queue.splice(0, 20);
      const batchResponses = await Promise.all(
        batch.map(async (node) => {
          const res = await listAllDriveChildrenPaginated(
            accessToken,
            apiKey,
            node.id
          );
          return { node, res };
        })
      );

      for (const { node, res } of batchResponses) {
        if (!res.ok) {
          if (node.id === origin.folderId) {
            folderError = {
              httpStatus: res.httpStatus,
              message:
                res.errorMessage ||
                'Erro ao listar arquivos da pasta raiz de origem.',
            };
          }
          continue;
        }

        foldersScanned += 1;

        for (const item of res.files) {
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            if (isExcludedSuperBonusFolder(item.id, item.name || '')) {
              excludedFolders.push({
                folderId: item.id,
                folderName: item.name || 'Super Bônus 3.500 livros',
                folderPath: `${node.path}/${item.name || 'Super Bônus'}`,
                reason:
                  'Excluída conforme Regra 12 (Pasta Super Bônus de 3.500 ebooks).',
              });
              continue;
            }

            const childPath = `${node.path}/${item.name}`;
            const childTopSubfolder =
              node.id === origin.folderId
                ? `${origin.label} / ${item.name}`
                : node.topSubfolderLabel;

            queue.push({
              id: item.id,
              path: childPath,
              topSubfolderLabel: childTopSubfolder,
            });
          } else {
            rawOriginFiles.push({
              file: item,
              parentFolderId: node.id,
              folderPath: node.path,
              topSubfolderLabel: node.topSubfolderLabel,
            });
          }
        }
      }

      if (folderError) {
        break;
      }
    }

    if (folderError) {
      sourcesSummary.push({
        sourceKey: origin.key,
        folderId: origin.folderId,
        folderLabel: origin.label,
        folderDriveName: metaCheck.folderName,
        folderUrl: origin.url,
        importMode: origin.importMode,
        accessStatus:
          folderError.httpStatus === 401 || folderError.httpStatus === 403
            ? 'denied'
            : 'error',
        httpStatus: folderError.httpStatus,
        errorMessage: folderError.message,
        foldersScanned,
        totalFiles: 0,
        ebookCount: 0,
        pdfCount: 0,
        epubCount: 0,
        audioCount: 0,
        mp3Count: 0,
        m4aCount: 0,
        unsupportedCount: 0,
        extensionsBreakdown: {},
        duplicateIdCount: 0,
        alreadyInCatalogCount: 0,
        duplicateTitleCount: 0,
        problemCount: 0,
        excludedFolders,
        subfoldersBreakdown: [],
        lastScannedAt: new Date().toISOString(),
      });
      continue;
    }

    const nowIso = new Date().toISOString();

    for (const entry of rawOriginFiles) {
      const f = entry.file;
      const fileSize = Math.max(0, Number(f.size) || 0);
      const parsed = extractMetadataFromFilename(
        f.name || '',
        f.mimeType || '',
        f.fileExtension,
        entry.folderPath
      );

      const issueFlags = [...parsed.issueFlags];
      if (fileSize <= 1024) {
        issueFlags.push('ZERO_OR_TINY_SIZE');
      }

      // Se não havia autor no nome do arquivo, mas a subpasta em Acervo Adicional é nome de autor, ainda preservamos a flag MISSING_AUTHOR_IN_FILENAME ou extraímos autor auxiliar se aplicável
      const itemId = makeDeterministicUuid(
        `inv-item:${origin.key}:${f.id}`
      );
      const alreadyInCatalog = existingCatalogDriveIds.has(f.id);

      allItems.push({
        id: itemId,
        run_id: runId,
        source_folder_key: origin.key,
        source_root_folder_id: origin.folderId,
        source_folder_label: origin.label,
        parent_folder_id: entry.parentFolderId,
        folder_path: entry.folderPath,
        top_subfolder_label: entry.topSubfolderLabel,
        drive_file_id: f.id,
        original_name: f.name || 'sem_nome',
        extension: parsed.extension,
        mime_type: f.mimeType || 'application/octet-stream',
        file_size: fileSize,
        md5_checksum: f.md5Checksum || null,
        extracted_title: parsed.extractedTitle,
        extracted_author: parsed.extractedAuthor,
        normalized_title: parsed.normalizedTitle,
        candidate_type: parsed.candidateType,
        is_duplicate_id: alreadyInCatalog,
        already_in_catalog_assets: alreadyInCatalog,
        is_possible_duplicate_title: false,
        duplicate_group_size: 1,
        has_issues: issueFlags.length > 0,
        issue_flags: issueFlags,
        is_private: true,
        rights_status: 'pending',
        import_allowed:
          origin.importAllowed && parsed.candidateType !== 'unsupported',
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    sourcesSummary.push({
      sourceKey: origin.key,
      folderId: origin.folderId,
      folderLabel: origin.label,
      folderDriveName: metaCheck.folderName,
      folderUrl: origin.url,
      importMode: origin.importMode,
      accessStatus: 'accessible',
      httpStatus: 200,
      errorMessage: null,
      foldersScanned,
      totalFiles: rawOriginFiles.length,
      ebookCount: 0,
      pdfCount: 0,
      epubCount: 0,
      audioCount: 0,
      mp3Count: 0,
      m4aCount: 0,
      unsupportedCount: 0,
      extensionsBreakdown: {},
      duplicateIdCount: 0,
      alreadyInCatalogCount: 0,
      duplicateTitleCount: 0,
      problemCount: 0,
      excludedFolders,
      subfoldersBreakdown: [],
      lastScannedAt: nowIso,
    });
  }

  // 2. Identificar duplicatas por drive_file_id e possíveis duplicatas por título normalizado
  const countByDriveId = new Map<string, number>();
  const itemsByNormalizedTitle = new Map<string, DriveInventoryItemRecord[]>();

  for (const item of allItems) {
    countByDriveId.set(
      item.drive_file_id,
      (countByDriveId.get(item.drive_file_id) || 0) + 1
    );
    if (item.normalized_title && item.normalized_title.length >= 3) {
      const list = itemsByNormalizedTitle.get(item.normalized_title) || [];
      list.push(item);
      itemsByNormalizedTitle.set(item.normalized_title, list);
    }
  }

  for (const item of allItems) {
    const idOccurrences = countByDriveId.get(item.drive_file_id) || 1;
    if (idOccurrences > 1 || item.already_in_catalog_assets) {
      item.is_duplicate_id = true;
    }

    const titleGroup = itemsByNormalizedTitle.get(item.normalized_title) || [];
    if (titleGroup.length > 1) {
      item.is_possible_duplicate_title = true;
      item.duplicate_group_size = titleGroup.length;
    }
  }

  // 3. Consolidar métricas por pasta de origem e totais globais
  const globalByExtension: Record<string, number> = {};
  const globalIssuesBreakdown: Record<string, number> = {};

  for (const src of sourcesSummary) {
    const srcItems = allItems.filter(
      (i) => i.source_folder_key === src.sourceKey
    );
    const subpathMap = new Map<string, SubfolderBreakdownRecord>();

    for (const item of srcItems) {
      src.extensionsBreakdown[item.extension] =
        (src.extensionsBreakdown[item.extension] || 0) + 1;
      globalByExtension[item.extension] =
        (globalByExtension[item.extension] || 0) + 1;

      if (item.candidate_type === 'ebook') {
        src.ebookCount += 1;
        if (item.extension === 'pdf') src.pdfCount += 1;
        else if (item.extension === 'epub') src.epubCount += 1;
      } else if (item.candidate_type === 'audio') {
        src.audioCount += 1;
        if (item.extension === 'mp3') src.mp3Count += 1;
        else if (item.extension === 'm4a') src.m4aCount += 1;
      } else {
        src.unsupportedCount += 1;
      }

      if (item.is_duplicate_id) src.duplicateIdCount += 1;
      if (item.already_in_catalog_assets) src.alreadyInCatalogCount += 1;
      if (item.is_possible_duplicate_title) src.duplicateTitleCount += 1;
      if (item.has_issues) src.problemCount += 1;

      for (const flag of item.issue_flags) {
        globalIssuesBreakdown[flag] = (globalIssuesBreakdown[flag] || 0) + 1;
      }

      const subKey = item.top_subfolder_label;
      let subRec = subpathMap.get(subKey);
      if (!subRec) {
        subRec = {
          subpath: subKey,
          totalFiles: 0,
          ebookCount: 0,
          pdfCount: 0,
          epubCount: 0,
          audioCount: 0,
          mp3Count: 0,
          m4aCount: 0,
          unsupportedCount: 0,
        };
        subpathMap.set(subKey, subRec);
      }
      subRec.totalFiles += 1;
      if (item.candidate_type === 'ebook') {
        subRec.ebookCount += 1;
        if (item.extension === 'pdf') subRec.pdfCount += 1;
        else if (item.extension === 'epub') subRec.epubCount += 1;
      } else if (item.candidate_type === 'audio') {
        subRec.audioCount += 1;
        if (item.extension === 'mp3') subRec.mp3Count += 1;
        else if (item.extension === 'm4a') subRec.m4aCount += 1;
      } else {
        subRec.unsupportedCount += 1;
      }
    }

    src.subfoldersBreakdown = Array.from(subpathMap.values()).sort(
      (a, b) => b.totalFiles - a.totalFiles
    );
  }

  const duplicateTitleGroups: DuplicateTitleGroupSummary[] = [];
  for (const [normTitle, group] of itemsByNormalizedTitle.entries()) {
    if (group.length > 1) {
      const uniqueSources = Array.from(
        new Set(group.map((g) => g.source_folder_label))
      );
      const uniqueExts = Array.from(new Set(group.map((g) => g.extension)));
      duplicateTitleGroups.push({
        normalizedTitle: normTitle,
        sampleTitle: group[0].extracted_title,
        count: group.length,
        sources: uniqueSources,
        extensions: uniqueExts,
        sampleFiles: group.slice(0, 5).map((g) => ({
          driveFileId: g.drive_file_id,
          originalName: g.original_name,
          sourceKey: g.source_folder_key,
          folderPath: g.folder_path,
          extension: g.extension,
          fileSize: g.file_size,
        })),
      });
    }
  }
  duplicateTitleGroups.sort((a, b) => b.count - a.count);

  const completedAtDate = new Date();
  const completedAt = completedAtDate.toISOString();
  const durationMs = completedAtDate.getTime() - startedAtDate.getTime();

  const hasPgTables = await checkPostgresInventoryTablesAvailable(sb);

  const totalFiles = allItems.length;
  const foldersScanned = sourcesSummary.reduce(
    (acc, s) => acc + s.foldersScanned,
    0
  );
  const ebookCandidates = sourcesSummary.reduce(
    (acc, s) => acc + s.ebookCount,
    0
  );
  const pdfCount = sourcesSummary.reduce((acc, s) => acc + s.pdfCount, 0);
  const epubCount = sourcesSummary.reduce((acc, s) => acc + s.epubCount, 0);
  const audioCandidates = sourcesSummary.reduce(
    (acc, s) => acc + s.audioCount,
    0
  );
  const mp3Count = sourcesSummary.reduce((acc, s) => acc + s.mp3Count, 0);
  const m4aCount = sourcesSummary.reduce((acc, s) => acc + s.m4aCount, 0);
  const unsupportedFiles = sourcesSummary.reduce(
    (acc, s) => acc + s.unsupportedCount,
    0
  );
  const duplicateIdCount = allItems.filter((i) => i.is_duplicate_id).length;
  const alreadyInCatalogCount = allItems.filter(
    (i) => i.already_in_catalog_assets
  ).length;
  const possibleDuplicateTitleFilesCount = allItems.filter(
    (i) => i.is_possible_duplicate_title
  ).length;
  const problemFilesCount = allItems.filter((i) => i.has_issues).length;
  const excludedSuperBonusFoldersCount = sourcesSummary.reduce(
    (acc, s) => acc + s.excludedFolders.length,
    0
  );

  const anyFailed = sourcesSummary.some((s) => s.accessStatus !== 'accessible');
  const allFailed = sourcesSummary.every(
    (s) => s.accessStatus !== 'accessible'
  );

  const report: DriveInventoryRunReport = {
    runId,
    startedAt,
    completedAt,
    durationMs,
    status: allFailed ? 'failed' : anyFailed ? 'partial' : 'completed',
    storageMode: hasPgTables ? 'postgres_tables' : 'supabase_private_storage',
    postgresTablesReady: hasPgTables,
    totals: {
      totalFiles,
      foldersScanned,
      ebookCandidates,
      pdfCount,
      epubCount,
      audioCandidates,
      mp3Count,
      m4aCount,
      unsupportedFiles,
      duplicateIdCount,
      alreadyInCatalogCount,
      possibleDuplicateTitleFilesCount,
      possibleDuplicateTitleGroupsCount: duplicateTitleGroups.length,
      problemFilesCount,
      excludedSuperBonusFoldersCount,
      byExtension: globalByExtension,
      issuesBreakdown: globalIssuesBreakdown,
    },
    sources: sourcesSummary,
    topDuplicateGroups: duplicateTitleGroups.slice(0, 100),
  };

  // Persistir nas tabelas PostgreSQL se disponíveis no Supabase
  if (hasPgTables) {
    try {
      await sb.from('drive_inventory_runs').upsert({
        id: runId,
        started_at: startedAt,
        completed_at: completedAt,
        status: report.status,
        total_files: totalFiles,
        ebook_candidates: ebookCandidates,
        audio_candidates: audioCandidates,
        unsupported_files: unsupportedFiles,
        duplicate_id_count: duplicateIdCount,
        duplicate_title_count: possibleDuplicateTitleFilesCount,
        problem_files_count: problemFilesCount,
        excluded_super_bonus_count: excludedSuperBonusFoldersCount,
        summary_json: report,
        updated_at: completedAt,
      });

      for (const s of sourcesSummary) {
        await sb.from('drive_inventory_sources').upsert(
          {
            source_key: s.sourceKey,
            folder_id: s.folderId,
            folder_label: s.folderLabel,
            folder_drive_name: s.folderDriveName,
            folder_url: s.folderUrl,
            import_mode: s.importMode,
            access_status: s.accessStatus,
            http_status: s.httpStatus,
            error_message: s.errorMessage,
            folders_scanned: s.foldersScanned,
            total_files: s.totalFiles,
            ebook_count: s.ebookCount,
            pdf_count: s.pdfCount,
            epub_count: s.epubCount,
            audio_count: s.audioCount,
            mp3_count: s.mp3Count,
            m4a_count: s.m4aCount,
            unsupported_count: s.unsupportedCount,
            duplicate_id_count: s.duplicateIdCount,
            duplicate_title_count: s.duplicateTitleCount,
            problem_count: s.problemCount,
            excluded_folders_json: s.excludedFolders,
            subfolders_breakdown_json: s.subfoldersBreakdown,
            last_scanned_at: s.lastScannedAt,
            updated_at: completedAt,
          },
          { onConflict: 'source_key' }
        );
      }

      // Upsert em lotes de 500 registros de forma idempotente (onConflict: source_folder_key,drive_file_id)
      const BATCH_SIZE = 500;
      for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        const chunk = allItems.slice(i, i + BATCH_SIZE);
        await sb.from('drive_inventory_items').upsert(chunk, {
          onConflict: 'source_folder_key,drive_file_id',
        });
      }
    } catch (pgErr) {
      console.warn(
        '[CRT Inventory] Aviso ao gravar em tabelas PostgreSQL, mantendo persistência no bucket privado:',
        pgErr
      );
    }
  }

  const state: StoredInventoryState = {
    version: 1,
    report,
    items: allItems,
  };

  await saveInventoryToPrivateStorage(sb, state);
  return state;
}

export function queryInventoryItems(
  state: StoredInventoryState,
  query: {
    sourceKey?: string;
    candidateType?: string;
    filter?: string;
    extension?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }
): {
  totalFiltered: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: DriveInventoryItemRecord[];
} {
  const sourceKey = (query.sourceKey || 'all').trim().toLowerCase();
  const candidateType = (query.candidateType || 'all').trim().toLowerCase();
  const filter = (query.filter || 'all').trim().toLowerCase();
  const extension = (query.extension || 'all').trim().toLowerCase();
  const search = (query.search || '').trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(
    100,
    Math.max(10, Math.floor(Number(query.pageSize) || 50))
  );

  const filtered = state.items.filter((item) => {
    if (sourceKey !== 'all' && item.source_folder_key !== sourceKey) {
      return false;
    }
    if (candidateType !== 'all' && item.candidate_type !== candidateType) {
      return false;
    }
    if (extension !== 'all' && item.extension.toLowerCase() !== extension) {
      return false;
    }
    if (filter === 'duplicates') {
      if (!item.is_duplicate_id && !item.is_possible_duplicate_title) {
        return false;
      }
    } else if (filter === 'duplicate_id') {
      if (!item.is_duplicate_id) return false;
    } else if (filter === 'duplicate_title') {
      if (!item.is_possible_duplicate_title) return false;
    } else if (filter === 'issues') {
      if (!item.has_issues) return false;
    } else if (filter === 'import_candidates') {
      if (!item.import_allowed) return false;
    }

    if (search) {
      const hay = `${item.original_name} ${item.extracted_title} ${item.extracted_author || ''} ${item.folder_path} ${item.drive_file_id}`.toLowerCase();
      if (!hay.includes(search)) {
        return false;
      }
    }

    return true;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const startIdx = (clampedPage - 1) * pageSize;
  const sliced = filtered.slice(startIdx, startIdx + pageSize);

  return {
    totalFiltered,
    page: clampedPage,
    pageSize,
    totalPages,
    items: sliced,
  };
}
