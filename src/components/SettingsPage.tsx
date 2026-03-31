import { useState } from 'react';
import { Database, Shield, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SettingsPageProps {
  onInitDefaults: () => Promise<void>;
}

export default function SettingsPage({ onInitDefaults }: SettingsPageProps) {
  const { user } = useAuth();
  const [initializing, setInitializing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  async function handleInitialize() {
    setInitializing(true);
    try {
      await onInitDefaults();
      setInitialized(true);
    } finally {
      setInitializing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Configuracion</h2>
        <p className="text-slate-500">Ajustes de la aplicacion</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Cuenta</h3>
            <p className="text-xs text-slate-400">Informacion de tu cuenta de Google</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Nombre</span>
            <span className="font-medium text-slate-900">{user?.displayName}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Email</span>
            <span className="font-medium text-slate-900">{user?.email}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-500">UID</span>
            <span className="font-mono text-xs text-slate-400">{user?.uid}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Base de Datos</h3>
            <p className="text-xs text-slate-400">Inicializar datos por defecto</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Esto creara los gastos fijos por defecto (BPS, DGI, Combustible, etc.) si no existen. No se sobreescribiran datos existentes.
        </p>
        <button
          onClick={handleInitialize}
          disabled={initializing || initialized}
          className="btn-secondary flex items-center gap-2"
        >
          <Database className="w-4 h-4" />
          {initializing ? 'Inicializando...' : initialized ? 'Datos inicializados' : 'Inicializar Datos por Defecto'}
        </button>
      </div>

      <div className="card border-blue-200 bg-blue-50/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Firebase</h3>
            <p className="text-xs text-slate-400">Configuracion de la base de datos</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Para conectar con Firebase, necesitas crear un proyecto en{' '}
          <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            Firebase Console
          </a>{' '}
          y configurar las variables de entorno en el archivo <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">.env</code>
        </p>
        <div className="bg-slate-900 rounded-lg p-4 text-sm font-mono text-slate-300 space-y-1">
          <p className="text-slate-500"># .env</p>
          <p>VITE_FIREBASE_API_KEY=tu-api-key</p>
          <p>VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com</p>
          <p>VITE_FIREBASE_PROJECT_ID=tu-proyecto-id</p>
          <p>VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com</p>
          <p>VITE_FIREBASE_MESSAGING_SENDER_ID=tu-sender-id</p>
          <p>VITE_FIREBASE_APP_ID=tu-app-id</p>
        </div>
      </div>
    </div>
  );
}
