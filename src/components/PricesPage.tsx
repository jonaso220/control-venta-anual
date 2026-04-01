import { useState, useEffect } from 'react';
import { Save, DollarSign, History, ChevronDown, ChevronUp } from 'lucide-react';
import type { PriceConfig } from '../types';
import { formatCurrency } from './Dashboard';

interface PriceHistoryEntry {
  sifones: number;
  litros6: number;
  litros12: number;
  litros20: number;
  changedAt: Date;
}

interface PricesPageProps {
  prices: PriceConfig;
  onSave: (prices: PriceConfig) => Promise<void>;
  year: number;
  history: PriceHistoryEntry[];
}

export default function PricesPage({ prices, onSave, year, history }: PricesPageProps) {
  const [form, setForm] = useState<PriceConfig>(prices);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setForm(prices);
  }, [prices]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    form.sifones !== prices.sifones ||
    form.litros6 !== prices.litros6 ||
    form.litros12 !== prices.litros12 ||
    form.litros20 !== prices.litros20;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Precios de Ganancia</h2>
        <p className="text-slate-500 dark:text-slate-400">Configura el margen de ganancia por producto - {year}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
        <PriceCard label="Sifones" description="Ganancia por sifon" value={form.sifones} onChange={v => setForm(f => ({ ...f, sifones: v }))} color="indigo" />
        <PriceCard label="6 Litros" description="Ganancia por bidon de 6L" value={form.litros6} onChange={v => setForm(f => ({ ...f, litros6: v }))} color="sky" />
        <PriceCard label="12 Litros" description="Ganancia por bidon de 12L" value={form.litros12} onChange={v => setForm(f => ({ ...f, litros12: v }))} color="amber" />
        <PriceCard label="20 Litros" description="Ganancia por bidon de 20L" value={form.litros20} onChange={v => setForm(f => ({ ...f, litros20: v }))} color="emerald" />
      </div>

      <div className="flex items-center gap-3 max-w-2xl">
        <button onClick={handleSave} disabled={saving || !hasChanges} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Precios'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">Precios guardados correctamente</span>}
        {!hasChanges && !saved && <span className="text-sm text-slate-400">Sin cambios</span>}
      </div>

      {/* Price History */}
      {history.length > 0 && (
        <div className="max-w-2xl">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <History className="w-4 h-4" />
            Historial de cambios ({history.length})
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.map((entry, i) => {
                const date = entry.changedAt instanceof Date
                  ? entry.changedAt
                  : new Date((entry.changedAt as unknown as { seconds: number }).seconds * 1000);
                return (
                  <div key={i} className="card !p-3 text-sm">
                    <p className="text-xs text-slate-400 mb-1">
                      {date.toLocaleDateString('es-UY')} {date.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <span>Sifones: {formatCurrency(entry.sifones)}</span>
                      <span>6L: {formatCurrency(entry.litros6)}</span>
                      <span>12L: {formatCurrency(entry.litros12)}</span>
                      <span>20L: {formatCurrency(entry.litros20)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriceCard({ label, description, value, onChange, color }: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    sky: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <DollarSign className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{label}</h3>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="input-field !pl-8 text-lg font-semibold"
          value={value || ''}
          onFocus={e => e.target.select()}
          onChange={e => onChange(Number(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}
