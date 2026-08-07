import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  DatabaseBackup,
  FileSpreadsheet,
  FileUp,
  Loader2,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  BackupValidationError,
  BackupRestorePartialError,
  downloadFullBackup,
  readBackupFile,
  restoreFullBackup,
  type FullBackup,
} from '../services/backup';

interface SettingsPageProps {
  year: number;
  onExportYearExcel: () => void | Promise<void>;
  onRestoreComplete?: () => void | Promise<void>;
}

type BusyOperation = 'excel' | 'backup' | 'validation' | 'restore' | null;
type StatusMessage = { kind: 'success' | 'error'; text: string } | null;
const BACKUP_REMINDER_DAYS = 7;

export default function SettingsPage({ year, onExportYearExcel, onRestoreComplete }: SettingsPageProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<BusyOperation>(null);
  const [pendingBackup, setPendingBackup] = useState<FullBackup | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [safetyBackupReady, setSafetyBackupReady] = useState(false);

  const operationInProgress = busy !== null;
  const backupIsDue = !lastBackupAt || (
    Date.now() - new Date(lastBackupAt).getTime()
  ) >= BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (!user) {
      setLastBackupAt(null);
      return;
    }
    setLastBackupAt(readStoredBackupDate(user.uid));
  }, [user]);

  function rememberBackup(uid: string, downloadedAt = new Date().toISOString()): void {
    try {
      localStorage.setItem(backupStorageKey(uid), downloadedAt);
    } catch {
      // A blocked/full storage area must not turn a successful export into an
      // application error. The reminder is only local convenience metadata.
    }
    setLastBackupAt(downloadedAt);
  }

  async function handleYearExcel(): Promise<void> {
    setBusy('excel');
    setStatus(null);
    try {
      await onExportYearExcel();
      setStatus({ kind: 'success', text: `La exportación Excel de ${year} se descargó correctamente.` });
    } catch (error) {
      console.error('Error exporting yearly Excel:', error);
      setStatus({ kind: 'error', text: 'No se pudo generar la exportación Excel.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleBackupDownload(): Promise<void> {
    if (!user) return;
    setBusy('backup');
    setStatus(null);
    setPendingBackup(null);
    setSafetyBackupReady(false);
    try {
      const backup = await downloadFullBackup(user.uid);
      rememberBackup(user.uid);
      setStatus({
        kind: 'success',
        text: `Se generó el respaldo de ${backup.counts.total} documentos y se inició su descarga. Verifica que aparezca en Descargas.`,
      });
    } catch (error) {
      console.error('Error creating full backup:', error);
      setStatus({
        kind: 'error',
        text: readableBackupError(error, 'No se pudo crear el respaldo completo desde Firestore.'),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleBackupFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy('validation');
    setStatus(null);
    setPendingBackup(null);
    setSafetyBackupReady(false);
    try {
      if (!file.name.toLocaleLowerCase().endsWith('.json')) {
        throw new BackupValidationError('Selecciona un archivo de respaldo con extensión .json.');
      }
      const backup = await readBackupFile(file);
      setPendingBackup(backup);
      setSafetyBackupReady(false);
    } catch (error) {
      console.error('Error validating backup:', error);
      setStatus({
        kind: 'error',
        text: readableBackupError(error, 'El archivo no es un respaldo válido.'),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(): Promise<void> {
    if (!user || !pendingBackup) return;
    const backup = pendingBackup;
    setBusy('restore');
    setStatus(null);

    try {
      if (!safetyBackupReady) {
        const safetyBackup = await downloadFullBackup(user.uid);
        rememberBackup(user.uid);
        setSafetyBackupReady(true);
        setStatus({
          kind: 'success',
          text: `Se generó el respaldo de seguridad de ${safetyBackup.counts.total} documentos. Verifica que aparezca en Descargas y luego pulsa “Confirmar y restaurar”.`,
        });
        return;
      }

      const result = await restoreFullBackup(user.uid, backup);
      setPendingBackup(null);
      setSafetyBackupReady(false);
      setStatus({
        kind: 'success',
        text: `Restauración completada: se escribieron ${result.writtenDocuments} documentos y se conservaron ${result.skippedDocuments} que ya existían o eran más nuevos.`,
      });

      if (onRestoreComplete) {
        try {
          await onRestoreComplete();
        } catch (refreshError) {
          console.error('Backup restored but UI refresh failed:', refreshError);
          setStatus({
            kind: 'success',
            text: `Se combinaron ${result.writtenDocuments} documentos, pero la pantalla no pudo actualizarse. Recárgala para ver los datos.`,
          });
        }
      }
    } catch (error) {
      console.error('Error restoring full backup:', error);
      setStatus({
        kind: 'error',
        text: readableBackupError(
          error,
          'No se pudo completar la restauración. No se borró ningún documento; puedes volver a intentarlo.',
        ),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Configuración</h2>
        <p className="text-slate-500 dark:text-slate-400">Cuenta, exportaciones y respaldos</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Cuenta</h3>
            <p className="text-xs text-slate-400">Información de tu cuenta de Google</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Nombre</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 break-words">{user?.displayName || 'Sin nombre'}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Email</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 break-all">{user?.email}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2">
            <span className="text-slate-500 dark:text-slate-400">UID</span>
            <span className="font-mono text-xs text-slate-400 break-all">{user?.uid}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Exportación Excel de {year}</h3>
            <p className="text-xs text-slate-400">Informe del año seleccionado</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Genera una planilla con ventas, gastos y márgenes cargados en la pantalla para {year}.
          Es un informe de consulta y no sirve para restaurar la base de datos.
        </p>
        <button
          type="button"
          onClick={handleYearExcel}
          disabled={operationInProgress}
          className="btn-secondary flex items-center gap-2"
        >
          {busy === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          {busy === 'excel' ? 'Generando…' : `Descargar Excel ${year}`}
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
            <DatabaseBackup className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Respaldo completo JSON</h3>
            <p className="text-xs text-slate-400">Todos los años, IDs y fechas normalizadas</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
          Lee datos frescos directamente desde Firestore e incluye ventas, gastos fijos y variables,
          configuración de márgenes, historial de cambios y metas de todos los años.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          La restauración valida el archivo completo y combina documentos por ID. Nunca elimina los datos que ya existen.
        </p>

        <div
          role="status"
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            backupIsDue
              ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200'
              : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
          }`}
        >
          {lastBackupAt
            ? `Última descarga registrada en este dispositivo: ${formatBackupDate(lastBackupAt)}.${backupIsDue ? ' Conviene crear un respaldo nuevo.' : ''}`
            : 'Este dispositivo todavía no registra un respaldo. Conviene descargar uno ahora.'}
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleBackupDownload}
            disabled={operationInProgress || !user}
            className="btn-primary flex items-center gap-2"
          >
            {busy === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
            {busy === 'backup' ? 'Leyendo Firestore…' : 'Descargar respaldo completo'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            disabled={operationInProgress}
            onChange={handleBackupFile}
            aria-label="Seleccionar respaldo JSON para restaurar"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={operationInProgress || !user}
            className="btn-secondary flex items-center gap-2"
          >
            {busy === 'validation' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {busy === 'validation' ? 'Validando…' : 'Restaurar desde JSON'}
          </button>
        </div>

        {pendingBackup ? (
          <div role="alert" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <CircleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="font-semibold text-amber-900 dark:text-amber-100">Confirma la restauración</h4>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  Se combinarán <strong>{pendingBackup.counts.total} documentos</strong> con la cuenta{' '}
                  <strong className="break-all">{user?.email || 'actual'}</strong>. Los documentos actuales que no estén en el archivo se conservarán.
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  {safetyBackupReady
                    ? 'El respaldo de seguridad ya fue generado. Confirma que apareció en Descargas antes de continuar.'
                    : 'El primer paso genera el respaldo de seguridad y pausa el proceso. Ningún dato se escribe hasta que confirmes la descarga con un segundo clic.'}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-800 dark:text-amber-200">
                  <div><dt className="inline font-medium">Creado: </dt><dd className="inline">{formatBackupDate(pendingBackup.exportedAt)}</dd></div>
                  <div><dt className="inline font-medium">Años: </dt><dd className="inline">{pendingBackup.years.join(', ') || 'sin datos anuales'}</dd></div>
                  <div><dt className="inline font-medium">Ventas: </dt><dd className="inline">{pendingBackup.counts.sales}</dd></div>
                  <div><dt className="inline font-medium">Gastos fijos: </dt><dd className="inline">{pendingBackup.counts.expenses}</dd></div>
                  <div><dt className="inline font-medium">Versiones de gastos fijos: </dt><dd className="inline">{pendingBackup.counts.fixedExpenseVersions}</dd></div>
                  <div><dt className="inline font-medium">Gastos variables: </dt><dd className="inline">{pendingBackup.counts.variableExpenses}</dd></div>
                  <div><dt className="inline font-medium">Config./historial/metas: </dt><dd className="inline">{pendingBackup.counts.config + pendingBackup.counts.priceHistory + pendingBackup.counts.goals}</dd></div>
                </dl>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={operationInProgress}
                    className="btn-primary flex items-center gap-2"
                  >
                    {busy === 'restore' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                    {busy === 'restore'
                      ? safetyBackupReady ? 'Restaurando…' : 'Generando respaldo…'
                      : safetyBackupReady ? 'Confirmar y restaurar' : 'Preparar respaldo de seguridad'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingBackup(null);
                      setSafetyBackupReady(false);
                    }}
                    disabled={operationInProgress}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {status ? (
          <div
            role={status.kind === 'error' ? 'alert' : 'status'}
            aria-live={status.kind === 'error' ? 'assertive' : 'polite'}
            className={`mt-5 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              status.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
                : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
            }`}
          >
            {status.kind === 'error'
              ? <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{status.text}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function readableBackupError(error: unknown, fallback: string): string {
  return error instanceof BackupValidationError || error instanceof BackupRestorePartialError
    ? error.message
    : fallback;
}

function formatBackupDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'fecha desconocida';
  return new Intl.DateTimeFormat('es-UY', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function backupStorageKey(uid: string): string {
  return `control-venta-anual:last-backup:${uid}`;
}

function readStoredBackupDate(uid: string): string | null {
  try {
    const value = localStorage.getItem(backupStorageKey(uid));
    if (!value || !Number.isFinite(new Date(value).getTime())) {
      if (value) localStorage.removeItem(backupStorageKey(uid));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
