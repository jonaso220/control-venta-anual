import { useState, useMemo } from 'react';
import { Save, ShoppingCart } from 'lucide-react';
import type { SalesEntry, PriceConfig } from '../types';
import { MONTHS } from '../types';
import { formatCurrency } from './Dashboard';

interface SalesPageProps {
  sales: SalesEntry[];
  prices: PriceConfig;
  year: number;
  onSave: (entry: SalesEntry) => Promise<void>;
}

export default function SalesPage({ sales, prices, year, onSave }: SalesPageProps) {
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [form, setForm] = useState({ sifones: 0, litros6: 0, litros12: 0, litros20: 0 });
  const [saving, setSaving] = useState(false);

  const salesMap = useMemo(() => {
    const map = new Map<number, SalesEntry>();
    sales.forEach(s => map.set(s.month, s));
    return map;
  }, [sales]);

  function startEditing(month: number) {
    const existing = salesMap.get(month);
    setForm({
      sifones: existing?.sifones ?? 0,
      litros6: existing?.litros6 ?? 0,
      litros12: existing?.litros12 ?? 0,
      litros20: existing?.litros20 ?? 0,
    });
    setEditingMonth(month);
  }

  async function handleSave() {
    if (editingMonth === null) return;
    setSaving(true);
    try {
      await onSave({
        year,
        month: editingMonth,
        ...form,
      });
      setEditingMonth(null);
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  }

  function calcIncome(entry: SalesEntry | undefined) {
    if (!entry) return 0;
    return (
      entry.sifones * prices.sifones +
      entry.litros6 * prices.litros6 +
      entry.litros12 * prices.litros12 +
      entry.litros20 * prices.litros20
    );
  }

  const totalUnits = sales.reduce((a, s) => a + s.sifones + s.litros6 + s.litros12 + s.litros20, 0);
  const totalIncome = sales.reduce((a, s) => a + calcIncome(s), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ventas</h2>
          <p className="text-slate-500">Registro mensual de ventas - {year}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="stat-card !p-3 !flex-row !items-center !gap-3">
            <ShoppingCart className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-slate-400">Total Unidades</p>
              <p className="font-bold text-slate-900">{totalUnits.toLocaleString()}</p>
            </div>
          </div>
          <div className="stat-card !p-3 !flex-row !items-center !gap-3">
            <span className="text-green-500 font-bold text-lg">$</span>
            <div>
              <p className="text-xs text-slate-400">Ingresos</p>
              <p className="font-bold text-slate-900">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden !p-0">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="px-6 py-3">Mes</th>
              <th className="px-6 py-3 text-right">Sifones</th>
              <th className="px-6 py-3 text-right">6 Litros</th>
              <th className="px-6 py-3 text-right">12 Litros</th>
              <th className="px-6 py-3 text-right">20 Litros</th>
              <th className="px-6 py-3 text-right">Total Unid.</th>
              <th className="px-6 py-3 text-right">Ingreso</th>
              <th className="px-6 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const entry = salesMap.get(month);
              const isEditing = editingMonth === month;
              const totalU = (entry?.sifones ?? 0) + (entry?.litros6 ?? 0) + (entry?.litros12 ?? 0) + (entry?.litros20 ?? 0);
              const income = calcIncome(entry);

              return (
                <tr key={month} className={`${isEditing ? 'bg-blue-50' : 'hover:bg-slate-50'} transition-colors`}>
                  <td className="px-6 py-3 font-medium text-slate-900">{MONTHS[month - 1]}</td>
                  {isEditing ? (
                    <>
                      <td className="px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.sifones} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, sifones: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.litros6} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros6: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.litros12} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros12: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.litros20} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros20: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-6 py-3 text-right text-slate-400">-</td>
                      <td className="px-6 py-3 text-right text-slate-400">-</td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={handleSave} disabled={saving} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
                            <Save className="w-3 h-3" />
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button onClick={() => setEditingMonth(null)} className="btn-secondary !py-1.5 !px-3 text-xs">
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-3 text-right text-slate-600">{entry?.sifones ?? 0}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{entry?.litros6 ?? 0}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{entry?.litros12 ?? 0}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{entry?.litros20 ?? 0}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-900">{totalU}</td>
                      <td className="px-6 py-3 text-right font-medium text-green-600">{formatCurrency(income)}</td>
                      <td className="px-6 py-3 text-center">
                        <button onClick={() => startEditing(month)} className="btn-secondary !py-1.5 !px-3 text-xs">
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td className="px-6 py-3">Total</td>
              <td className="px-6 py-3 text-right">{sales.reduce((a, s) => a + s.sifones, 0)}</td>
              <td className="px-6 py-3 text-right">{sales.reduce((a, s) => a + s.litros6, 0)}</td>
              <td className="px-6 py-3 text-right">{sales.reduce((a, s) => a + s.litros12, 0)}</td>
              <td className="px-6 py-3 text-right">{sales.reduce((a, s) => a + s.litros20, 0)}</td>
              <td className="px-6 py-3 text-right">{totalUnits}</td>
              <td className="px-6 py-3 text-right text-green-600">{formatCurrency(totalIncome)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
