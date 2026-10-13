import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  Database,
  FileWarning,
  FolderCheck,
  FolderLock,
  Headphones,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { getSupabaseAuthHeaders } from '../services/supabase';

interface ExcludedFolderRecord {
  folderId: string;
  folderName: string;
  folderPath: string;
  reason: string;
}

interface SubfolderBreakdownRecord {
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

interface DriveInventorySourceSummary {
  sourceKey:
    | 'ebooks_main'
    | 'ebooks'
    | 'audiobooks'
    | 'audiobooks_2'
    | 'audiobooks_3'
    | 'additional_analysis';
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

interface DuplicateTitleGroupSummary {
  normalizedTitle: string;
  sampleTitle: string;
  count: number;
  sources: string[];
  extensions: string[];
  sampleFiles: Array<{
    driveFileId: string;
    originalName: string;
    sourceKey: string;
    folderPath: string;
    extension: string;
    fileSize: number;
  }>;
}

interface DriveInventoryRunReport {
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

interface DriveInventoryItemRecord {
  id: string;
  source_folder_key: string;
  source_folder_label: string;
  folder_path: string;
  top_subfolder_label: string;
  drive_file_id: string;
  original_name: string;
  extension: string;
  mime_type: string;
  file_size: number;
  extracted_title: string;
  extracted_author: string | null;
  normalized_title: string;
  candidate_type: 'ebook' | 'audio' | 'unsupported';
  is_duplicate_id: boolean;
  already_in_catalog_assets: boolean;
  is_possible_duplicate_title: boolean;
  duplicate_group_size: number;
  has_issues: boolean;
  issue_flags: string[];
  is_private: boolean;
  rights_status: string;
  import_allowed: boolean;
}

interface AdminInventoryScreenProps {
  onBackToApp: () => void;
  onOpenImporter?: () => void;
  onNotify: (
    title: string,
    subtitle?: string,
    type?: 'info' | 'success'
  ) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatIssueLabel(flag: string): string {
  switch (flag) {
    case 'UNSUPPORTED_FORMAT':
      return 'Formato incompatível';
    case 'MISSING_AUTHOR':
      return 'Autor ausente no nome';
    case 'INCOMPLETE_TITLE':
      return 'Título incompleto/duvidoso';
    case 'SUSPICIOUS_FILENAME':
      return 'Marcador de cópia/origem no nome';
    case 'ZERO_OR_TINY_SIZE':
      return 'Tamanho zerado/inválido';
    default:
      return flag;
  }
}

export const AdminInventoryScreen: React.FC<AdminInventoryScreenProps> = ({
  onBackToApp,
  onOpenImporter,
  onNotify,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [runningScan, setRunningScan] = useState<boolean>(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<DriveInventoryRunReport | null>(null);
  const [items, setItems] = useState<DriveInventoryItemRecord[]>([]);
  const [pagination, setPagination] = useState<{
    totalFiltered: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({
    totalFiltered: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });

  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [specialFilter, setSpecialFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const loadInventory = useCallback(
    async (pageToLoad = 1) => {
      setLoading(true);
      setErrorMessage(null);
      setAccessDeniedMessage(null);

      try {
        const headers = await getSupabaseAuthHeaders();
        const params = new URLSearchParams({
          source: sourceFilter,
          candidateType: typeFilter,
          filter: specialFilter,
          search: searchQuery.trim(),
          page: String(pageToLoad),
          pageSize: '50',
        });

        const res = await fetch(`/api/admin/inventory?${params.toString()}`, {
          method: 'GET',
          headers,
          credentials: 'same-origin',
        });

        const payload = await res.json().catch(() => ({}));

        if (res.status === 401 || res.status === 403) {
          setAccessDeniedMessage(
            payload?.message ||
              'Acesso restrito a administradores explicitamente autorizados no servidor.'
          );
          return;
        }

        if (!res.ok || !payload?.ok) {
          throw new Error(
            payload?.message ||
              `Erro ao carregar inventário administrativo (HTTP ${res.status}).`
          );
        }

        setReport(payload.report || null);
        setItems(Array.isArray(payload.items) ? payload.items : []);
        if (payload.pagination) {
          setPagination(payload.pagination);
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erro ao consultar inventário do acervo.'
        );
      } finally {
        setLoading(false);
      }
    },
    [sourceFilter, typeFilter, specialFilter, searchQuery]
  );

  useEffect(() => {
    loadInventory(currentPage);
  }, [loadInventory, currentPage]);

  const handleRunInventoryScan = async () => {
    setRunningScan(true);
    setErrorMessage(null);
    setAccessDeniedMessage(null);

    try {
      const headers = await getSupabaseAuthHeaders({
        'Content-Type': 'application/json',
      });
      const res = await fetch('/api/admin/inventory/run', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          source: sourceFilter,
          candidateType: typeFilter,
          filter: specialFilter,
          search: searchQuery.trim(),
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        setAccessDeniedMessage(
          payload?.message ||
            'Acesso restrito a administradores explicitamente autorizados.'
        );
        return;
      }

      if (!res.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            `Falha ao executar varredura do inventário (HTTP ${res.status}).`
        );
      }

      setReport(payload.report || null);
      setItems(Array.isArray(payload.items) ? payload.items : []);
      if (payload.pagination) {
        setPagination(payload.pagination);
      }
      setCurrentPage(1);
      onNotify(
        'Inventário concluído com sucesso',
        `${payload.report?.totals?.totalFiles?.toLocaleString('pt-BR') || 0} arquivos catalogados no Supabase.`,
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao executar varredura do Google Drive.';
      setErrorMessage(msg);
      onNotify('Erro no inventário', msg, 'info');
    } finally {
      setRunningScan(false);
    }
  };

  if (accessDeniedMessage) {
    return (
      <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#0E1525] border border-rose-500/30 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-white">
            Acesso Administrativo Restrito (HTTP 403)
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            {accessDeniedMessage}
          </p>
          <button
            type="button"
            onClick={onBackToApp}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition cursor-pointer"
          >
            Voltar ao Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#0B101E]/95 backdrop-blur-md border-b border-white/[0.08] px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#131C31] hover:bg-[#1B2642] border border-white/[0.08] text-xs font-medium text-slate-200 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao App</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-400/25">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin · Fase 13
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Privado · rights_status=pending · Sem Super Bônus
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-white mt-0.5">
                Inventário Automático do Acervo CRT Books
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onOpenImporter && (
              <button
                type="button"
                onClick={onOpenImporter}
                className="px-3.5 py-2 rounded-xl bg-[#131C31] hover:bg-[#1B2642] border border-white/[0.08] text-xs font-medium text-slate-200 transition cursor-pointer"
              >
                Importador Fase 3
              </button>
            )}
            <button
              type="button"
              disabled={runningScan}
              onClick={handleRunInventoryScan}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-950 font-semibold text-xs transition cursor-pointer"
            >
              {runningScan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Varrendo Google Drive...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Atualizar Inventário Real</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {errorMessage && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex items-start gap-3 text-rose-200 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Erro ao processar inventário</p>
              <p className="text-rose-300/90 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {report && (
          <>
            {/* 6 Cards Principais exigidos na especificação */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Total de Arquivos</span>
                  <Layers className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold text-white mt-2 font-mono">
                  {report.totals.totalFiles.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {report.totals.foldersScanned} pastas/subpastas lidas
                </p>
              </div>

              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Candidatos a Ebook</span>
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-emerald-300 mt-2 font-mono">
                  {report.totals.ebookCandidates.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {report.totals.pdfCount.toLocaleString('pt-BR')} PDF ·{' '}
                  {report.totals.epubCount.toLocaleString('pt-BR')} EPUB
                </p>
              </div>

              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Candidatos a Áudio</span>
                  <Headphones className="w-4 h-4 text-sky-400" />
                </div>
                <p className="text-2xl font-bold text-sky-300 mt-2 font-mono">
                  {report.totals.audioCandidates.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {report.totals.mp3Count.toLocaleString('pt-BR')} MP3 ·{' '}
                  {report.totals.m4aCount.toLocaleString('pt-BR')} M4A
                </p>
              </div>

              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Possíveis Duplicatas</span>
                  <Copy className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-amber-300 mt-2 font-mono">
                  {report.totals.possibleDuplicateTitleFilesCount.toLocaleString(
                    'pt-BR'
                  )}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {report.totals.possibleDuplicateTitleGroupsCount.toLocaleString(
                    'pt-BR'
                  )}{' '}
                  grupos de título · {report.totals.duplicateIdCount} por ID
                </p>
              </div>

              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Arquivos com Problemas</span>
                  <FileWarning className="w-4 h-4 text-rose-400" />
                </div>
                <p className="text-2xl font-bold text-rose-300 mt-2 font-mono">
                  {report.totals.problemFilesCount.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {report.totals.unsupportedFiles.toLocaleString('pt-BR')}{' '}
                  formatos incompatíveis
                </p>
              </div>
            </section>

            {/* Status de Acesso a Cada Pasta de Origem */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span>Status de Acesso e Totais Reais por Pasta de Origem</span>
                </h2>
                <span className="text-[11px] text-slate-400 font-mono">
                  Última leitura:{' '}
                  {new Date(report.completedAt).toLocaleString('pt-BR')} (
                  {(report.durationMs / 1000).toFixed(1)}s)
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {report.sources.map((src) => {
                  const isAccessible = src.accessStatus === 'accessible';
                  return (
                    <div
                      key={src.sourceKey}
                      className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.06] text-slate-300">
                              {src.importMode === 'analysis_only'
                                ? 'Somente Análise (Sem Importação)'
                                : 'Origem Candidata'}
                            </span>
                            <h3 className="text-sm font-bold text-white mt-1.5">
                              {src.folderLabel}
                            </h3>
                            <p className="text-[11px] text-slate-400 font-mono break-all">
                              ID: {src.folderId}{' '}
                              {src.folderDriveName
                                ? `(${src.folderDriveName})`
                                : ''}
                            </p>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 ${
                              isAccessible
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {isAccessible ? (
                              <>
                                <FolderCheck className="w-3.5 h-3.5" />
                                <span>Acessível (HTTP {src.httpStatus})</span>
                              </>
                            ) : (
                              <>
                                <FolderLock className="w-3.5 h-3.5" />
                                <span>
                                  {src.accessStatus.toUpperCase()} (HTTP{' '}
                                  {src.httpStatus || 'Erro'})
                                </span>
                              </>
                            )}
                          </span>
                        </div>

                        {src.errorMessage && (
                          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-[11px] text-rose-200">
                            {src.errorMessage}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                          <div className="rounded-xl bg-[#131C31]/70 p-2.5">
                            <span className="text-slate-400 text-[11px]">
                              Total na Origem
                            </span>
                            <p className="text-base font-bold text-white font-mono">
                              {src.totalFiles.toLocaleString('pt-BR')}
                            </p>
                            <span className="text-[10px] text-slate-400">
                              {src.foldersScanned} pasta(s) lida(s)
                            </span>
                          </div>
                          <div className="rounded-xl bg-[#131C31]/70 p-2.5">
                            <span className="text-slate-400 text-[11px]">
                              Ebooks / Áudios
                            </span>
                            <p className="text-base font-bold text-cyan-300 font-mono">
                              {src.ebookCount.toLocaleString('pt-BR')} /{' '}
                              {src.audioCount.toLocaleString('pt-BR')}
                            </p>
                            <span className="text-[10px] text-slate-400">
                              Incompatíveis: {src.unsupportedCount}
                            </span>
                          </div>
                        </div>

                        {/* Subpastas internas */}
                        {src.subfoldersBreakdown.length > 0 && (
                          <div className="pt-2 space-y-1">
                            <p className="text-[11px] font-semibold text-slate-300">
                              Divisão por Subpasta Principal:
                            </p>
                            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                              {src.subfoldersBreakdown.map((sub) => (
                                <div
                                  key={sub.subpath}
                                  className="flex items-center justify-between text-[11px] bg-white/[0.03] rounded-lg px-2.5 py-1.5"
                                >
                                  <span className="text-slate-300 truncate max-w-[190px]">
                                    {sub.subpath}
                                  </span>
                                  <span className="font-mono text-slate-200 shrink-0">
                                    {sub.totalFiles.toLocaleString('pt-BR')} arq (
                                    {sub.ebookCount > 0
                                      ? `${sub.ebookCount} ebook`
                                      : ''}
                                    {sub.ebookCount > 0 && sub.audioCount > 0
                                      ? ', '
                                      : ''}
                                    {sub.audioCount > 0
                                      ? `${sub.audioCount} áudio`
                                      : ''}
                                    {sub.unsupportedCount > 0
                                      ? `, ${sub.unsupportedCount} outros`
                                      : ''}
                                    )
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pastas Excluídas (Super Bônus) */}
                        {src.excludedFolders.length > 0 && (
                          <div className="pt-1">
                            {src.excludedFolders.map((ex) => (
                              <div
                                key={ex.folderId}
                                className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-2 text-[11px] text-amber-200 flex items-start gap-2"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">
                                    Pasta Super Bônus Ignorada:
                                  </span>{' '}
                                  {ex.folderName} ({ex.folderId})
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span>
                          Duplicatas título:{' '}
                          <strong className="text-amber-300 font-mono">
                            {src.duplicateTitleCount.toLocaleString('pt-BR')}
                          </strong>
                        </span>
                        <span>
                          Com problemas:{' '}
                          <strong className="text-rose-300 font-mono">
                            {src.problemCount.toLocaleString('pt-BR')}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Resumo por Formato/Extensão e Problemas */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Totais Reais por Extensão de Arquivo
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(report.totals.byExtension)
                    .sort((a, b) => b[1] - a[1])
                    .map(([ext, count]) => (
                      <button
                        key={ext}
                        type="button"
                        onClick={() => {
                          setSearchQuery(`.${ext}`);
                          setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#131C31] hover:bg-[#1B2642] border border-white/[0.08] text-xs font-mono text-slate-200 cursor-pointer"
                      >
                        .{ext.toUpperCase()}:{' '}
                        <strong className="text-cyan-300">
                          {count.toLocaleString('pt-BR')}
                        </strong>
                      </button>
                    ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Detalhamento de Problemas Detectados
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(report.totals.issuesBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([flag, count]) => (
                      <span
                        key={flag}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200"
                      >
                        {formatIssueLabel(flag)}:{' '}
                        <strong className="font-mono text-rose-300">
                          {count.toLocaleString('pt-BR')}
                        </strong>
                      </span>
                    ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* Filtros e Tabela Paginada de Itens */}
        <section className="rounded-2xl bg-[#0E1526] border border-white/[0.08] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-white">
              Arquivos Catalogados no Inventário (
              {pagination.totalFiltered.toLocaleString('pt-BR')})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[#131C31] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="all">Todas as pastas de origem</option>
                <option value="ebooks_main">
                  Ebooks Fonte 1 (1KgyMW0W9e...)
                </option>
                <option value="ebooks">Ebooks Fonte 2 (1JOSnganIK...)</option>
                <option value="audiobooks">
                  Audiobooks Fonte 1 (1HjOIzbvYW...)
                </option>
                <option value="audiobooks_2">
                  Audiobooks Fonte 2 (1-6gsrxIJV...)
                </option>
                <option value="audiobooks_3">
                  Audiobooks Fonte 3 (1RI9d8lkul...)
                </option>
                <option value="additional_analysis">
                  Acervo adicional (Análise)
                </option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[#131C31] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="all">Todos os tipos</option>
                <option value="ebook">Candidatos a Ebook (PDF/EPUB)</option>
                <option value="audio">Candidatos a Áudio (MP3/M4A)</option>
                <option value="unsupported">Formatos incompatíveis</option>
              </select>

              <select
                value={specialFilter}
                onChange={(e) => {
                  setSpecialFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[#131C31] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="all">Todos os registros</option>
                <option value="duplicates">
                  Somente possíveis duplicatas
                </option>
                <option value="duplicate_id">
                  Já no catálogo / ID duplicado
                </option>
                <option value="issues">Somente arquivos com problemas</option>
                <option value="import_candidates">
                  Aptos à futura importação
                </option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar título, autor, arquivo..."
                  className="bg-[#131C31] border border-white/[0.1] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 w-56"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <span>Consultando inventário no Supabase...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Nenhum arquivo encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400 text-[11px]">
                    <th className="py-2.5 px-2">Arquivo Original / Drive ID</th>
                    <th className="py-2.5 px-2">Título / Autor Extraído</th>
                    <th className="py-2.5 px-2">Pasta / Subpasta</th>
                    <th className="py-2.5 px-2">Tipo / Formato</th>
                    <th className="py-2.5 px-2">Tamanho</th>
                    <th className="py-2.5 px-2">Status / Alertas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-2.5 px-2 max-w-[240px]">
                        <p className="font-medium text-slate-200 truncate">
                          {item.original_name}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          {item.drive_file_id}
                        </p>
                      </td>
                      <td className="py-2.5 px-2 max-w-[220px]">
                        <p className="text-slate-200 truncate">
                          {item.extracted_title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {item.extracted_author || 'Autor não identificado'}
                        </p>
                      </td>
                      <td className="py-2.5 px-2 max-w-[200px]">
                        <p className="text-slate-300 truncate">
                          {item.top_subfolder_label}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {item.folder_path}
                        </p>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                            item.candidate_type === 'ebook'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : item.candidate_type === 'audio'
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {item.candidate_type} · .{item.extension}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-300 whitespace-nowrap">
                        {formatBytes(item.file_size)}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex flex-wrap gap-1">
                          {item.already_in_catalog_assets && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px]">
                              Já no catálogo
                            </span>
                          )}
                          {item.is_possible_duplicate_title && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">
                              Título duplicado ({item.duplicate_group_size}x)
                            </span>
                          )}
                          {item.issue_flags.map((flag) => (
                            <span
                              key={flag}
                              className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px]"
                            >
                              {formatIssueLabel(flag)}
                            </span>
                          ))}
                          {!item.has_issues &&
                            !item.is_possible_duplicate_title && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                                OK · Pendente Direitos
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.08] text-xs text-slate-400">
            <span>
              Página {pagination.page} de {pagination.totalPages} (
              {pagination.totalFiltered.toLocaleString('pt-BR')} itens)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-[#131C31] disabled:opacity-40 text-slate-200 cursor-pointer"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(pagination.totalPages, p + 1)
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-[#131C31] disabled:opacity-40 text-slate-200 cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
