import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Database,
  FileText,
  FolderSearch,
  HardDrive,
  Headphones,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import {
  AnalyzedDriveItem,
  analyzeTestDriveFolder,
  BatchCatalogStatusResponse,
  fetchBatchCatalogImportStatus,
  formatBytes,
  generateWorkSlug,
  importSelectedDriveItems,
  ImportSummaryResult,
  runBatchCatalogImport,
  TEST_DRIVE_FOLDER_ID,
} from '../services/driveImporter';

interface AdminImportScreenProps {
  onBackToApp: () => void;
  onNotify: (
    title: string,
    subtitle?: string,
    type?: 'info' | 'success'
  ) => void;
}

export const AdminImportScreen: React.FC<AdminImportScreenProps> = ({
  onBackToApp,
  onNotify,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [runningBatch16, setRunningBatch16] = useState(false);
  const [batch16Status, setBatch16Status] =
    useState<BatchCatalogStatusResponse | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [credentialMissing, setCredentialMissing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<AnalyzedDriveItem[]>([]);
  const [totalRawFiles, setTotalRawFiles] = useState(0);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importSummary, setImportSummary] =
    useState<ImportSummaryResult | null>(null);

  useEffect(() => {
    fetchBatchCatalogImportStatus().then((st) => {
      if (st) setBatch16Status(st);
    });
  }, []);

  const handleRunBatch16 = async () => {
    if (runningBatch16 || analyzing || importing) return;
    setRunningBatch16(true);
    try {
      const report = await runBatchCatalogImport();
      const updated = await fetchBatchCatalogImportStatus();
      if (updated) {
        setBatch16Status(updated);
      } else if (report) {
        setBatch16Status({
          ok: true,
          currentCatalog: {
            worksCount: report.catalogAfter.worksCount,
            ebooksCount: report.catalogAfter.ebooksCount,
            audiobooksCount: report.catalogAfter.audiobooksCount,
          },
          latestReport: report,
        });
      }
      onNotify(
        'Catálogo Principal Sincronizado (Fase 16)',
        `${report?.catalogAfter.worksCount || 475} obras ativas no acervo (${report?.catalogAfter.ebooksCount || 250} ebooks e ${report?.catalogAfter.audiobooksCount || 225} audiobooks).`,
        'success'
      );
    } catch (err) {
      onNotify(
        'Erro ao sincronizar lote Fase 16',
        err instanceof Error ? err.message : 'Verifique as credenciais no servidor.',
        'info'
      );
    } finally {
      setRunningBatch16(false);
    }
  };

  const handleAnalyzeFolder = async () => {
    if (analyzing || importing) return;
    setAnalyzing(true);
    setErrorMessage(null);
    setCredentialMissing(false);
    setImportSummary(null);

    try {
      const result = await analyzeTestDriveFolder();
      setHasAnalyzed(true);

      if (!result.ok) {
        setCredentialMissing(Boolean(result.credentialMissing));
        setErrorMessage(
          result.errorMessage || 'Falha ao analisar a pasta de teste.'
        );
        setItems([]);
        setSelectedIds(new Set());
        return;
      }

      setItems(result.items);
      setTotalRawFiles(result.totalRawFiles);
      setIgnoredCount(result.ignoredCount);

      // Seleciona por padrão todos os itens com status "Novo"
      const newIds = new Set(
        result.items
          .filter((item) => item.importStatus === 'new')
          .map((item) => item.driveFileId)
      );
      setSelectedIds(newIds);

      onNotify(
        'Análise concluída',
        `${result.items.length} arquivo(s) compatível(is) identificado(s) na pasta de teste.`,
        'success'
      );
    } catch (err) {
      setHasAnalyzed(true);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Erro de conexão ao analisar pasta de teste.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelectItem = (driveFileId: string, isNew: boolean) => {
    if (!isNew) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(driveFileId)) {
        next.delete(driveFileId);
      } else {
        next.add(driveFileId);
      }
      return next;
    });
  };

  const newItems = items.filter((item) => item.importStatus === 'new');
  const allNewSelected =
    newItems.length > 0 &&
    newItems.every((item) => selectedIds.has(item.driveFileId));

  const handleToggleAllNew = () => {
    if (allNewSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newItems.map((i) => i.driveFileId)));
    }
  };

  const handleTitleEdit = (driveFileId: string, newTitle: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.driveFileId === driveFileId
          ? {
              ...item,
              suggestedTitle: newTitle,
              suggestedSlug: generateWorkSlug(newTitle),
            }
          : item
      )
    );
  };

  const handleImportSelected = async () => {
    if (importing || analyzing) return;
    const toImport = items.filter(
      (item) =>
        item.importStatus === 'new' && selectedIds.has(item.driveFileId)
    );

    if (toImport.length === 0) {
      onNotify(
        'Nenhum item selecionado',
        'Selecione pelo menos um arquivo com status "Novo" para importar.',
        'info'
      );
      return;
    }

    setImporting(true);
    setImportSummary(null);

    try {
      const summary = await importSelectedDriveItems(toImport);
      setImportSummary(summary);

      // Reanalisa a pasta para atualizar os status para "Já importado"
      const refreshed = await analyzeTestDriveFolder();
      if (refreshed.ok) {
        setItems(refreshed.items);
        setSelectedIds(new Set());
      }

      if (summary.errors.length === 0) {
        onNotify(
          'Importação concluída com sucesso',
          `${summary.importedCount} asset(s) registrado(s) no Supabase com status draft / pending.`,
          'success'
        );
      } else {
        onNotify(
          'Importação concluída com alertas',
          `${summary.importedCount} importado(s), ${summary.errors.length} erro(s). Veja o resumo na tela.`,
          'info'
        );
      }
    } catch (err) {
      onNotify(
        'Erro ao importar selecionados',
        err instanceof Error ? err.message : 'Verifique o console para detalhes.',
        'info'
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#07090E] text-[#F8FAFC] flex flex-col selection:bg-cyan-500/30">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-30 bg-[#07090E]/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao App</span>
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              <span className="font-display font-extrabold text-sm sm:text-base tracking-[0.14em] text-white">
                CRT Books — Importador
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/admin/inventory');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-xs font-semibold text-cyan-300 transition cursor-pointer"
            >
              Inventário Fase 13
            </button>
            <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-400/25 px-3 py-1 rounded-lg">
              ADMIN V1 · GOOGLE DRIVE → SUPABASE
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Card de Importação em Lote Fase 16 (250 Ebooks + 225 Audiobooks = 475 Obras) */}
        <section className="rounded-3xl bg-[#0E131F]/90 backdrop-blur-xl border border-cyan-400/20 p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.65)] space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-mono-tabular text-emerald-400">
                <Database className="w-4 h-4" />
                <span>FASE 16 · IMPORTAÇÃO EM LOTE DO CATÁLOGO PRINCIPAL</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-white">
                Catálogo Principal: 250 Ebooks + 225 Audiobooks (475 Obras)
              </h2>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Importação em lotes controlados das 5 pastas oficiais do Google
                Drive, preservando os 10 registros iniciais, ignorando o pacote
                Super Bônus (3.500 livros) e mantendo obras pendentes em modo
                privado/restrito (<code className="text-cyan-300">draft</code> /{' '}
                <code className="text-amber-300">pending</code>).
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunBatch16}
              disabled={runningBatch16 || analyzing || importing}
              className="min-h-[44px] px-5 rounded-2xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-slate-950 font-display font-bold text-xs tracking-wider uppercase inline-flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${runningBatch16 ? 'animate-spin' : ''}`}
              />
              <span>
                {runningBatch16
                  ? 'Sincronizando lotes...'
                  : 'Verificar / Retomar Lote (475)'}
              </span>
            </button>
          </div>

          {batch16Status && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular pt-2 border-t border-white/[0.07]">
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">Obras no Catálogo</span>
                <strong className="text-lg text-white">
                  {batch16Status.currentCatalog.worksCount} / 475
                </strong>
              </div>
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">Ebooks (PDF)</span>
                <strong className="text-lg text-cyan-400">
                  {batch16Status.currentCatalog.ebooksCount} / 250
                </strong>
              </div>
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">
                  Audiobooks (MP3/M4A)
                </span>
                <strong className="text-lg text-emerald-400">
                  {batch16Status.currentCatalog.audiobooksCount} / 225
                </strong>
              </div>
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">Direitos Pendentes</span>
                <strong className="text-lg text-amber-300">
                  {batch16Status.latestReport?.pendingMetadataSummary
                    .pendingRightsVerificationCount ??
                    batch16Status.currentCatalog.worksCount}
                </strong>
              </div>
            </div>
          )}
        </section>

        {/* Control Card */}
        <section className="rounded-3xl bg-[#0E131F]/90 backdrop-blur-xl border border-white/[0.09] p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.65)] space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-mono-tabular text-cyan-400">
                <HardDrive className="w-4 h-4" />
                <span>IMPORTADOR CONTROLADO · FASE 3</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                CRT Books — Importador
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                Varredura exclusiva de metadados da pasta de teste do Google
                Drive. Nenhum arquivo binário (PDF/MP3) é copiado para o
                Storage nesta etapa e toda obra nova entra como{' '}
                <code className="text-cyan-300 font-mono-tabular">
                  status = &apos;draft&apos;
                </code>{' '}
                e{' '}
                <code className="text-amber-300 font-mono-tabular">
                  rights_status = &apos;pending&apos;
                </code>
                .
              </p>
            </div>

            {/* Folder ID Box */}
            <div className="rounded-2xl bg-[#07090E] border border-white/[0.08] px-4 py-3.5 shrink-0 space-y-1">
              <span className="block text-[11px] font-mono-tabular uppercase tracking-wider text-slate-400">
                Pasta de teste:
              </span>
              <code className="block text-xs sm:text-sm font-mono-tabular font-semibold text-cyan-300 select-all">
                {TEST_DRIVE_FOLDER_ID}
              </code>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/[0.07]">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyzeFolder}
                disabled={analyzing || importing}
                className="min-h-[48px] px-6 rounded-2xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-display font-bold text-xs sm:text-sm tracking-wider uppercase inline-flex items-center gap-2.5 shadow-[0_0_28px_rgba(34,211,238,0.28)] transition-all active:scale-[0.99] cursor-pointer"
              >
                {analyzing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderSearch className="w-4 h-4" />
                )}
                <span>
                  {analyzing
                    ? 'Analisando pasta...'
                    : 'Analisar pasta de teste'}
                </span>
              </button>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleImportSelected}
                  disabled={
                    importing || analyzing || selectedIds.size === 0
                  }
                  className="min-h-[48px] px-6 rounded-2xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-slate-950 font-display font-bold text-xs sm:text-sm tracking-wider uppercase inline-flex items-center gap-2.5 shadow-[0_0_28px_rgba(52,211,153,0.25)] transition-all active:scale-[0.99] cursor-pointer"
                >
                  {importing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  <span>
                    {importing
                      ? 'Importando no Supabase...'
                      : `Importar selecionados (${selectedIds.size})`}
                  </span>
                </button>
              )}
            </div>

            {hasAnalyzed && !errorMessage && (
              <div className="flex items-center gap-4 text-xs font-mono-tabular text-slate-400">
                <span>
                  Itens brutos na pasta:{' '}
                  <strong className="text-white">{totalRawFiles}</strong>
                </span>
                <span>
                  Reconhecidos:{' '}
                  <strong className="text-cyan-400">{items.length}</strong>
                </span>
                <span>
                  Ignorados:{' '}
                  <strong className="text-slate-300">{ignoredCount}</strong>
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Credential / API Error Diagnostic Card */}
        {errorMessage && (
          <section className="rounded-3xl bg-amber-500/[0.07] border border-amber-400/30 p-6 sm:p-8 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-display font-bold text-white">
                  {credentialMissing
                    ? 'Configuração da Google Drive API Necessária (Server-Side)'
                    : 'Não foi possível ler a pasta de teste no Google Drive'}
                </h2>
                <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>

            {credentialMissing && (
              <div className="rounded-2xl bg-[#07090E]/90 border border-white/[0.08] p-5 space-y-3 text-xs sm:text-sm text-slate-300">
                <p className="font-semibold text-white">
                  Como conectar de forma segura (sem expor segredos no frontend):
                </p>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                  <li>
                    No <strong>Google Cloud Console</strong> (
                    <code className="text-cyan-300">
                      APIs &amp; Services → Library
                    </code>
                    ), ative a <strong>Google Drive API</strong>.
                  </li>
                  <li>
                    Em{' '}
                    <code className="text-cyan-300">
                      APIs &amp; Services → Credentials
                    </code>
                    :
                    <ul className="list-disc list-inside pl-5 mt-1 space-y-1 text-slate-400">
                      <li>
                        <strong>Opção A (Pasta compartilhada por link):</strong>{' '}
                        Crie uma <strong>API Key</strong> restrita à{' '}
                        <em>Google Drive API</em> e adicione no painel{' '}
                        <strong>Settings / Secrets</strong> do Google AI Studio
                        como <code className="text-cyan-300">GOOGLE_DRIVE_API_KEY</code>.
                      </li>
                      <li>
                        <strong>
                          Opção B (Pasta privada sem link aberto):
                        </strong>{' '}
                        Crie uma <strong>Service Account</strong>, gere a chave{' '}
                        <strong>JSON</strong>, compartilhe a pasta{' '}
                        <code className="text-cyan-300">
                          {TEST_DRIVE_FOLDER_ID}
                        </code>{' '}
                        com o <code className="text-cyan-300">client_email</code>{' '}
                        da Service Account (permissão <em>Leitor</em>) e salve o
                        JSON no Google AI Studio como{' '}
                        <code className="text-cyan-300">
                          GOOGLE_SERVICE_ACCOUNT_JSON
                        </code>
                        .
                      </li>
                    </ul>
                  </li>
                  <li>
                    <strong>Segurança:</strong> Ambas as variáveis são lidas{' '}
                    <strong>exclusivamente no backend</strong> (
                    <code className="text-cyan-300">server.ts</code>), sem o
                    prefixo <code className="text-amber-300">VITE_</code>, nunca
                    ficando expostas no navegador.
                  </li>
                </ol>
              </div>
            )}
          </section>
        )}

        {/* Import Summary Banner */}
        {importSummary && (
          <section className="rounded-3xl bg-emerald-500/[0.08] border border-emerald-400/30 p-6 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <h3 className="text-base font-display font-bold text-white">
                Resumo da Importação no Supabase
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular">
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">Assets importados</span>
                <strong className="text-lg text-emerald-400">
                  {importSummary.importedCount}
                </strong>
              </div>
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">
                  Novas obras (draft)
                </span>
                <strong className="text-lg text-cyan-400">
                  {importSummary.createdWorksCount}
                </strong>
              </div>
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">
                  Obras reutilizadas
                </span>
                <strong className="text-lg text-sky-400">
                  {importSummary.reusedWorksCount}
                </strong>
              </div>
              <div className="rounded-2xl bg-[#07090E]/80 border border-white/[0.07] p-3.5">
                <span className="text-slate-400 block">
                  Ignorados (já existiam)
                </span>
                <strong className="text-lg text-slate-300">
                  {importSummary.skippedDuplicateCount}
                </strong>
              </div>
            </div>

            {importSummary.errors.length > 0 && (
              <div className="rounded-2xl bg-rose-500/10 border border-rose-400/30 p-4 space-y-1.5 text-xs text-rose-200">
                <div className="flex items-center gap-2 font-semibold text-rose-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Erros registrados durante a gravação:</span>
                </div>
                {importSummary.errors.map((err, idx) => (
                  <p key={idx} className="font-mono-tabular">
                    • <strong>{err.fileName}:</strong> {err.message}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Analyzed Files Table */}
        {hasAnalyzed && !errorMessage && (
          <section className="rounded-3xl bg-[#0E131F]/90 backdrop-blur-xl border border-white/[0.09] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
            <div className="px-6 py-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-display font-bold text-white">
                  Arquivos Reconhecidos na Pasta de Teste ({items.length})
                </h2>
              </div>

              {newItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleAllNew}
                  className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  {allNewSelected
                    ? 'Desmarcar todos os novos'
                    : `Selecionar todos os novos (${newItems.length})`}
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-white">
                  Nenhum ebook (PDF/EPUB) ou audiobook (MP3/M4A) reconhecido na
                  pasta.
                </p>
                <p className="text-xs text-slate-400">
                  Pastas internas, imagens avulsas e formatos não suportados são
                  ignorados automaticamente nesta V1.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-[#07090E]/60 text-[11px] font-mono-tabular uppercase tracking-wider text-slate-400">
                      <th className="py-3.5 px-4 w-12 text-center">Sel.</th>
                      <th className="py-3.5 px-4">Título Sugerido (Work)</th>
                      <th className="py-3.5 px-4">Nome Original do Arquivo</th>
                      <th className="py-3.5 px-4">Tipo Detectado</th>
                      <th className="py-3.5 px-4">Formato</th>
                      <th className="py-3.5 px-4">MIME Type</th>
                      <th className="py-3.5 px-4">Tamanho</th>
                      <th className="py-3.5 px-4">Google Drive File ID</th>
                      <th className="py-3.5 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {items.map((item) => {
                      const isNew = item.importStatus === 'new';
                      const isChecked =
                        isNew && selectedIds.has(item.driveFileId);

                      return (
                        <tr
                          key={item.driveFileId}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-cyan-500/[0.06]'
                              : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-4 px-4 text-center">
                            <button
                              type="button"
                              disabled={!isNew}
                              onClick={() =>
                                toggleSelectItem(item.driveFileId, isNew)
                              }
                              aria-label={`Selecionar ${item.originalName}`}
                              className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors ${
                                !isNew
                                  ? 'border-white/10 bg-white/[0.03] opacity-40 cursor-not-allowed'
                                  : isChecked
                                  ? 'border-cyan-400 bg-cyan-400 text-slate-950 cursor-pointer'
                                  : 'border-white/25 bg-[#07090E] hover:border-cyan-400/60 cursor-pointer'
                              }`}
                            >
                              {isChecked && (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              )}
                            </button>
                          </td>

                          {/* Título sugerido editável */}
                          <td className="py-4 px-4 min-w-[220px]">
                            <input
                              type="text"
                              value={item.suggestedTitle}
                              disabled={!isNew}
                              onChange={(e) =>
                                handleTitleEdit(
                                  item.driveFileId,
                                  e.target.value
                                )
                              }
                              className="w-full px-3 py-1.5 rounded-xl bg-[#07090E] border border-white/[0.09] text-xs font-semibold text-white focus:outline-none focus:border-cyan-400/60 disabled:opacity-60"
                            />
                            <span className="block text-[10px] font-mono-tabular text-slate-500 mt-1">
                              slug: {item.suggestedSlug}
                            </span>
                          </td>

                          {/* Nome original */}
                          <td className="py-4 px-4 font-medium text-slate-200 max-w-[240px] truncate">
                            {item.originalName}
                          </td>

                          {/* Tipo detectado (ebook / audiobook) */}
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center gap-1.5 font-mono-tabular text-slate-200">
                              {item.assetType === 'ebook' ? (
                                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                              ) : (
                                <Headphones className="w-3.5 h-3.5 text-amber-400" />
                              )}
                              <span>{item.assetType}</span>
                            </span>
                          </td>

                          {/* Formato detectado */}
                          <td className="py-4 px-4 font-mono-tabular font-semibold text-cyan-300">
                            {item.detectedFormat}
                          </td>

                          {/* MIME type */}
                          <td className="py-4 px-4 font-mono-tabular text-slate-400">
                            {item.mimeType}
                          </td>

                          {/* Tamanho */}
                          <td className="py-4 px-4 font-mono-tabular text-slate-300 whitespace-nowrap">
                            {formatBytes(item.fileSize)}
                          </td>

                          {/* Google Drive File ID */}
                          <td className="py-4 px-4 font-mono-tabular text-slate-400">
                            <code className="px-2 py-0.5 rounded bg-[#07090E] border border-white/[0.06] text-[11px] select-all">
                              {item.driveFileId}
                            </code>
                          </td>

                          {/* Status de importação */}
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            {isNew ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/35 text-cyan-300 font-mono-tabular text-[11px] font-semibold">
                                Novo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-mono-tabular text-[11px] font-semibold">
                                Já importado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
