import { getSupabaseAuthHeaders } from './supabase';

export const TEST_DRIVE_FOLDER_ID = '10P1srKtIb8-bpNSgK_97eG7UMl-r0ps_';

export type ImporterAssetType = 'ebook' | 'audiobook';
export type ImporterStatus = 'new' | 'already_imported';

export interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | number;
  md5Checksum?: string;
}

export interface AnalyzedDriveItem {
  driveFileId: string;
  originalName: string;
  assetType: ImporterAssetType;
  detectedFormat: string;
  mimeType: string;
  fileSize: number;
  checksum: string | null;
  suggestedTitle: string;
  inferredAuthor: string | null;
  suggestedSlug: string;
  importStatus: ImporterStatus;
  existingWorkId?: string | null;
}

export interface AnalyzeFolderResult {
  ok: boolean;
  folderId: string;
  credentialMissing?: boolean;
  errorMessage?: string;
  errorDetails?: unknown;
  totalRawFiles: number;
  ignoredCount: number;
  items: AnalyzedDriveItem[];
}

export interface ImportSummaryResult {
  importedCount: number;
  skippedDuplicateCount: number;
  createdWorksCount: number;
  reusedWorksCount: number;
  importedTitles: string[];
  errors: Array<{ fileName: string; message: string }>;
}

function formatEditorialWords(raw: string): string {
  const lowerWords = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
    'em',
    'na',
    'no',
    'nas',
    'nos',
    'para',
    'por',
    'com',
    'sem',
    'sob',
    'sobre',
    'a',
    'o',
    'as',
    'os',
    'um',
    'uma',
  ]);

  const words = raw.trim().split(/\s+/);
  return words
    .map((word, index) => {
      if (/^[A-Z]\.$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && lowerWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Extrai título e autor (somente quando separado com segurança por " - ") a partir do nome do arquivo.
 * NÃO inventa autor quando não há separador claro.
 */
export function extractTitleAndAuthorFromFileName(fileName: string): {
  title: string;
  author: string | null;
} {
  // 1. Remove a extensão final
  let cleaned = fileName.replace(/\.[a-zA-Z0-9]{2,5}$/, '');

  // 2. Remove tags entre colchetes ou parênteses ligadas a formato/cópia (ex: "(1)", "[PDF]")
  cleaned = cleaned.replace(
    /[\[\(]\s*(?:pdf|epub|mp3|m4a|wav|aac|ogg|flac|audio|audiobook|audiodrama|ebook|e-book|livro|completo|pt-?br|br|v\d+|\d+)\s*[\]\)]/gi,
    ' '
  );

  // 3. Remove numeração técnica inicial apenas quando seguida de separador explícito
  cleaned = cleaned.replace(/^(?:#\d{1,4}\s+|\d{1,4}\s*[\.\)\-_]\s+)/, '');

  // 4. Verifica se há separador explícito " - " entre Título e Autor
  if (cleaned.includes(' - ')) {
    const parts = cleaned
      .split(' - ')
      .map((p) => p.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (parts.length === 2 && parts[0].length >= 2 && parts[1].length >= 3) {
      return {
        title: formatEditorialWords(parts[0]),
        author: formatEditorialWords(parts[1]),
      };
    }
  }

  // 4b. Verifica padrão final "Título Nome-Sobrenome" (ex: "Nada pode me ferir David-Goggins")
  const trailingHyphenAuthor = cleaned
    .trim()
    .match(/^(.+?)\s+([A-ZÀ-Ú][a-zà-ú]+-[A-ZÀ-Ú][a-zà-ú]+)$/);
  if (trailingHyphenAuthor) {
    return {
      title: formatEditorialWords(trailingHyphenAuthor[1]),
      author: formatEditorialWords(
        trailingHyphenAuthor[2].replace(/-/g, ' ')
      ),
    };
  }

  // 5. Substitui underscores e hífens restantes por espaço
  cleaned = cleaned.replace(/_+/g, ' ');
  cleaned = cleaned.replace(/\s*[-–—]+\s*/g, ' ');
  cleaned = cleaned.replace(/\.{2,}/g, ' ');
  cleaned = cleaned.replace(
    /\b(?:pdf|epub|mp3|m4a|wav|aac|ogg|flac|audiobook|audio\s*book|ebook|e\s*book|versao\s*final|final|rev\d+)\b$/gi,
    ' '
  );
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return {
      title:
        fileName.replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim() || 'Obra Sem Título',
      author: null,
    };
  }

  return {
    title: formatEditorialWords(cleaned),
    author: null,
  };
}

export function normalizeSuggestedTitle(fileName: string): string {
  return extractTitleAndAuthorFromFileName(fileName).title;
}

export function generateWorkSlug(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || `obra-${Date.now()}`;
}

/**
 * Detecta se o arquivo do Google Drive é um ebook (PDF/EPUB) ou audiobook (MP3/M4A/áudio compatível).
 * Ignora pastas, imagens avulsas, arquivos temporários e formatos não reconhecidos.
 */
export function detectDriveFileFormat(file: RawDriveFile): {
  assetType: ImporterAssetType;
  detectedFormat: string;
} | null {
  const name = (file.name || '').trim();
  const mime = (file.mimeType || '').trim().toLowerCase();

  if (!name) return null;

  // Ignorar arquivos temporários ou ocultos
  if (
    name.startsWith('~$') ||
    name.startsWith('.') ||
    /\.(tmp|temp|part|crdownload|bak|swp)$/i.test(name)
  ) {
    return null;
  }

  // Ignorar pastas e atalhos do Google Drive
  if (
    mime === 'application/vnd.google-apps.folder' ||
    mime === 'application/vnd.google-apps.shortcut'
  ) {
    return null;
  }

  // Ignorar imagens avulsas e vídeos
  if (mime.startsWith('image/') || mime.startsWith('video/')) {
    return null;
  }

  const extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  // 1. PDF -> asset_type = 'ebook'
  if (mime === 'application/pdf' || ext === 'pdf') {
    return {
      assetType: 'ebook',
      detectedFormat: 'PDF',
    };
  }

  // 2. EPUB -> asset_type = 'ebook'
  if (
    mime === 'application/epub+zip' ||
    mime === 'application/epub' ||
    ext === 'epub'
  ) {
    return {
      assetType: 'ebook',
      detectedFormat: 'EPUB',
    };
  }

  // 3. MP3, M4A ou formatos de áudio compatíveis -> asset_type = 'audiobook'
  const audioExtensions: Record<string, string> = {
    mp3: 'MP3',
    m4a: 'M4A',
    m4b: 'M4B',
    aac: 'AAC',
    wav: 'WAV',
    ogg: 'OGG',
    flac: 'FLAC',
    opus: 'OPUS',
  };

  if (ext in audioExtensions) {
    return {
      assetType: 'audiobook',
      detectedFormat: audioExtensions[ext],
    };
  }

  if (mime.startsWith('audio/')) {
    if (mime.includes('mpeg') || mime.includes('mp3')) {
      return { assetType: 'audiobook', detectedFormat: 'MP3' };
    }
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('x-m4a')) {
      return { assetType: 'audiobook', detectedFormat: 'M4A' };
    }
    if (mime.includes('wav')) {
      return { assetType: 'audiobook', detectedFormat: 'WAV' };
    }
    if (mime.includes('ogg')) {
      return { assetType: 'audiobook', detectedFormat: 'OGG' };
    }
    if (mime.includes('flac')) {
      return { assetType: 'audiobook', detectedFormat: 'FLAC' };
    }
    if (mime.includes('aac')) {
      return { assetType: 'audiobook', detectedFormat: 'AAC' };
    }
    return { assetType: 'audiobook', detectedFormat: 'AUDIO' };
  }

  // Qualquer outro formato não reconhecido é ignorado nesta V1
  return null;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

/**
 * Analisa a pasta de teste 10P1srKtIb8-bpNSgK_97eG7UMl-r0ps_ sem gravar nada no banco.
 * Verifica na tabela `assets` quais `drive_file_id` já foram importados anteriormente.
 */
export async function analyzeTestDriveFolder(): Promise<AnalyzeFolderResult> {
  const authHeaders = await getSupabaseAuthHeaders({
    Accept: 'application/json',
  });
  const response = await fetch('/api/admin/drive/test-folder', {
    method: 'GET',
    headers: authHeaders,
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      folderId: TEST_DRIVE_FOLDER_ID,
      credentialMissing: data?.code === 'DRIVE_CREDENTIAL_MISSING',
      errorMessage:
        data?.message ||
        `Não foi possível ler a pasta de teste (${response.status}).`,
      errorDetails: data?.details,
      totalRawFiles: 0,
      ignoredCount: 0,
      items: [],
    };
  }

  const rawFiles: RawDriveFile[] = Array.isArray(data.files) ? data.files : [];
  const recognized: Omit<AnalyzedDriveItem, 'importStatus' | 'existingWorkId'>[] =
    [];
  let ignoredCount = 0;

  for (const file of rawFiles) {
    const fileSize = Number(file.size) || 0;
    const detection = detectDriveFileFormat(file);
    if (!detection || fileSize <= 0) {
      ignoredCount++;
      continue;
    }

    const extracted = extractTitleAndAuthorFromFileName(file.name);
    const suggestedSlug = generateWorkSlug(extracted.title);

    recognized.push({
      driveFileId: file.id,
      originalName: file.name,
      assetType: detection.assetType,
      detectedFormat: detection.detectedFormat,
      mimeType: file.mimeType || 'application/octet-stream',
      fileSize,
      checksum: file.md5Checksum || null,
      suggestedTitle: extracted.title,
      inferredAuthor: extracted.author,
      suggestedSlug,
    });
  }

  // Duplicidade verificada no backend usando SUPABASE_SERVICE_ROLE_KEY
  const existingAssetsMap: Record<string, string | null> =
    data.existingAssetsMap && typeof data.existingAssetsMap === 'object'
      ? data.existingAssetsMap
      : {};

  const items: AnalyzedDriveItem[] = recognized.map((item) => {
    const alreadyExists = Object.prototype.hasOwnProperty.call(
      existingAssetsMap,
      item.driveFileId
    );
    return {
      ...item,
      importStatus: alreadyExists ? 'already_imported' : 'new',
      existingWorkId: existingAssetsMap[item.driveFileId] || null,
    };
  });

  return {
    ok: true,
    folderId: TEST_DRIVE_FOLDER_ID,
    totalRawFiles: rawFiles.length,
    ignoredCount,
    items,
  };
}

/**
 * Importa apenas os arquivos selecionados pelo administrador para as tabelas `works` e `assets`
 * exclusivamente via backend (`server.ts`) usando `SUPABASE_SERVICE_ROLE_KEY`.
 */
export async function importSelectedDriveItems(
  selectedItems: AnalyzedDriveItem[]
): Promise<ImportSummaryResult> {
  const authHeaders = await getSupabaseAuthHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });
  const response = await fetch('/api/admin/drive/import', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ items: selectedItems }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.message || `Erro ao importar arquivos (HTTP ${response.status}).`
    );
  }

  return payload.summary as ImportSummaryResult;
}

export interface BatchCatalogStatusResponse {
  ok: boolean;
  currentCatalog: {
    worksCount: number;
    ebooksCount: number;
    audiobooksCount: number;
  };
  latestReport: {
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
    sourcesReport: Array<{
      key: string;
      label: string;
      folderId: string;
      url: string;
      targetType: 'ebook' | 'audio';
      accessStatus: string;
      httpStatus: number;
      totalFilesFound: number;
      eligibleFilesCount: number;
      incompatibleOrCorruptedCount: number;
      excludedBonusSubfolders: string[];
    }>;
  } | null;
}

export async function fetchBatchCatalogImportStatus(): Promise<BatchCatalogStatusResponse | null> {
  try {
    const authHeaders = await getSupabaseAuthHeaders({
      Accept: 'application/json',
    });
    const res = await fetch('/api/admin/drive/batch-import/status', {
      method: 'GET',
      headers: authHeaders,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? (data as BatchCatalogStatusResponse) : null;
  } catch {
    return null;
  }
}

export async function runBatchCatalogImport(): Promise<
  BatchCatalogStatusResponse['latestReport']
> {
  const authHeaders = await getSupabaseAuthHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });
  const res = await fetch('/api/admin/drive/batch-import/run', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      batchSize: 50,
      targetEbooks: 250,
      targetAudiobooks: 225,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    throw new Error(
      payload?.message ||
        `Erro ao executar importação em lote (HTTP ${res.status}).`
    );
  }
  return payload.report;
}

