import { useState, useEffect } from 'react';
import { Save, DollarSign } from 'lucide-react';
import type { PriceConfig } from '../types';

interface PricesPageProps {
  prices: PriceConfig;
  onSave: (prices: PriceConfig) => Promise<void>;
  year: number;
}

export default function PricesPage({ prices, onSave, year }: PricesPageProps) {
  const [form, setForm] = useState<PriceConfig>(prices);

  useEffect(() => {
    setForm(prices);
  }, [prices]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        <h2 className="text-2xl font-bold text-slate-900">Precios de Ganancia</h2>
        <p className="text-slate-500">Configura el margen de ganancia por producto - {year}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
        <PriceCard
          label="Sifones"
          description="Ganancia por sifon"
          value={form.sifones}
          onChange={v => setForm(f => ({ ...f, sifones: v }))}
          color="indigo"
        />
        <PriceCard
          label="6 Litros"
          description="Ganancia por bidon de 6L"
          value={form.litros6}
          onChange={v => setForm(f => ({ ...f, litros6: v }))}
          color="sky"
        />
        <PriceCard
          label="12 Litros"
          description="Ganancia por bidon de 12L"
          value={form.litros12}
          onChange={v => setForm(f => ({ ...f, litros12: v }))}
          color="amber"
        />
        <PriceCard
          label="20 Litros"
          description="Ganancia por bidon de 20L"
          value={form.litros20}
          onChange={v => setForm(f => ({ ...f, litros20: v }))}
          color="emerald"
        />
      </div>

      <div className="flex items-center gap-3 max-w-2xl">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Precios'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Precios guardados correctamente</span>
        )}
        {!hasChanges && !saved && (
          <span className="text-sm text-slate-400">Sin cambios</span>
        )}
      </div>
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
    indigo: 'bg-indigo-100 text-indigo-600',
    sky: 'bg-sky-100 text-sky-600',
    amber: 'bg-amber-100 text-amber-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <DollarSign className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{label}</h3>
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
          onChange={e => onChange(Number(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}
