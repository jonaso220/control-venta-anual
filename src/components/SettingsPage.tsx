import { User, Download, FileSpreadsheet, FileJson } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SettingsPageProps {
  onBackupExcel: () => void;
  onBackupJSON: () => void;
}

export default function SettingsPage({ onBackupExcel, onBackupJSON }: SettingsPageProps) {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Configuracion</h2>
        <p className="text-slate-500 dark:text-slate-400">Ajustes de la aplicacion</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Cuenta</h3>
            <p className="text-xs text-slate-400">Informacion de tu cuenta de Google</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Nombre</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 break-words">{user?.displayName}</span>
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
            <Download className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Backup / Exportar Datos</h3>
            <p className="text-xs text-slate-400">Descarga todos tus datos del año actual</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Descarga un respaldo completo con ventas, gastos fijos, gastos variables y precios.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={onBackupExcel} className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Descargar Excel
          </button>
          <button onClick={onBackupJSON} className="btn-secondary flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            Descargar JSON
          </button>
        </div>
      </div>

    </div>
  );
}
