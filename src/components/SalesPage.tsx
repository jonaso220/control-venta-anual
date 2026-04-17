import { useState, useMemo } from 'react';
import { Save, ShoppingCart, Target } from 'lucide-react';
import type { SalesEntry, PriceConfig, SalesGoal } from '../types';
import { MONTHS } from '../types';
import { formatCurrency } from './Dashboard';

interface SalesPageProps {
  sales: SalesEntry[];
  prices: PriceConfig;
  year: number;
  onSave: (entry: SalesEntry) => Promise<void>;
  goals: SalesGoal[];
  onSaveGoal: (goal: Omit<SalesGoal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

export default function SalesPage({ sales, prices, year, onSave, goals, onSaveGoal }: SalesPageProps) {
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ventas</h2>
          <p className="text-slate-500 dark:text-slate-400">Registro mensual de ventas - {year}</p>
        </div>
        <div className="flex gap-3 text-sm flex-wrap">
          <div className="stat-card !p-3 !flex-row !items-center !gap-3">
            <ShoppingCart className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-slate-400">Total Unidades</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{totalUnits.toLocaleString()}</p>
            </div>
          </div>
          <div className="stat-card !p-3 !flex-row !items-center !gap-3">
            <span className="text-green-500 font-bold text-lg">$</span>
            <div>
              <p className="text-xs text-slate-400">Ingresos</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
          const entry = salesMap.get(month);
          const isEditing = editingMonth === month;
          const totalU = (entry?.sifones ?? 0) + (entry?.litros6 ?? 0) + (entry?.litros12 ?? 0) + (entry?.litros20 ?? 0);
          const income = calcIncome(entry);

          return (
            <div key={month} className={`card !p-4 ${isEditing ? 'border-blue-300 dark:border-blue-700' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">{MONTHS[month - 1]}</h4>
                {!isEditing && (
                  <button onClick={() => startEditing(month)} className="btn-secondary !py-1.5 !px-3 text-xs">
                    Editar
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sifones</label>
                      <input type="number" min="0" className="input-field !py-2" value={form.sifones} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, sifones: Number(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">6 Litros</label>
                      <input type="number" min="0" className="input-field !py-2" value={form.litros6} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros6: Number(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">12 Litros</label>
                      <input type="number" min="0" className="input-field !py-2" value={form.litros12} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros12: Number(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">20 Litros</label>
                      <input type="number" min="0" className="input-field !py-2" value={form.litros20} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros20: Number(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 !py-2">
                      <Save className="w-4 h-4" />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditingMonth(null)} className="btn-secondary !py-2">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Sifones</p>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{entry?.sifones ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">6 Litros</p>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{entry?.litros6 ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">12 Litros</p>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{entry?.litros12 ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">20 Litros</p>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{entry?.litros20 ?? 0}</p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Total unidades</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{totalU}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Ingreso</p>
                      <p className="font-semibold text-green-600">{formatCurrency(income)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="card !p-4 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Total del año</span>
            <div className="text-right">
              <p className="text-sm text-slate-500 dark:text-slate-400">{totalUnits} unidades</p>
              <p className="font-bold text-green-600">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block card !p-0 overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="table-header">
              <th className="px-4 sm:px-6 py-3">Mes</th>
              <th className="px-4 sm:px-6 py-3 text-right">Sifones</th>
              <th className="px-4 sm:px-6 py-3 text-right">6 Litros</th>
              <th className="px-4 sm:px-6 py-3 text-right">12 Litros</th>
              <th className="px-4 sm:px-6 py-3 text-right">20 Litros</th>
              <th className="px-4 sm:px-6 py-3 text-right">Total Unid.</th>
              <th className="px-4 sm:px-6 py-3 text-right">Ingreso</th>
              <th className="px-4 sm:px-6 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const entry = salesMap.get(month);
              const isEditing = editingMonth === month;
              const totalU = (entry?.sifones ?? 0) + (entry?.litros6 ?? 0) + (entry?.litros12 ?? 0) + (entry?.litros20 ?? 0);
              const income = calcIncome(entry);

              return (
                <tr key={month} className={`${isEditing ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'} transition-colors`}>
                  <td className="px-4 sm:px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{MONTHS[month - 1]}</td>
                  {isEditing ? (
                    <>
                      <td className="px-4 sm:px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.sifones} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, sifones: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-4 sm:px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.litros6} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros6: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-4 sm:px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.litros12} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros12: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-4 sm:px-6 py-2">
                        <input type="number" min="0" className="input-field text-right !py-1.5" value={form.litros20} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, litros20: Number(e.target.value) || 0 }))} />
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-right text-slate-400">-</td>
                      <td className="px-4 sm:px-6 py-3 text-right text-slate-400">-</td>
                      <td className="px-4 sm:px-6 py-3 text-center">
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
                      <td className="px-4 sm:px-6 py-3 text-right text-slate-600 dark:text-slate-300">{entry?.sifones ?? 0}</td>
                      <td className="px-4 sm:px-6 py-3 text-right text-slate-600 dark:text-slate-300">{entry?.litros6 ?? 0}</td>
                      <td className="px-4 sm:px-6 py-3 text-right text-slate-600 dark:text-slate-300">{entry?.litros12 ?? 0}</td>
                      <td className="px-4 sm:px-6 py-3 text-right text-slate-600 dark:text-slate-300">{entry?.litros20 ?? 0}</td>
                      <td className="px-4 sm:px-6 py-3 text-right font-medium text-slate-900 dark:text-slate-100">{totalU}</td>
                      <td className="px-4 sm:px-6 py-3 text-right font-medium text-green-600">{formatCurrency(income)}</td>
                      <td className="px-4 sm:px-6 py-3 text-center">
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
            <tr className="bg-slate-50 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100">
              <td className="px-4 sm:px-6 py-3">Total</td>
              <td className="px-4 sm:px-6 py-3 text-right">{sales.reduce((a, s) => a + s.sifones, 0)}</td>
              <td className="px-4 sm:px-6 py-3 text-right">{sales.reduce((a, s) => a + s.litros6, 0)}</td>
              <td className="px-4 sm:px-6 py-3 text-right">{sales.reduce((a, s) => a + s.litros12, 0)}</td>
              <td className="px-4 sm:px-6 py-3 text-right">{sales.reduce((a, s) => a + s.litros20, 0)}</td>
              <td className="px-4 sm:px-6 py-3 text-right">{totalUnits}</td>
              <td className="px-4 sm:px-6 py-3 text-right text-green-600">{formatCurrency(totalIncome)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Goals section */}
      <GoalsSection goals={goals} year={year} onSaveGoal={onSaveGoal} monthlyData={Array.from({ length: 12 }, (_, i) => {
        const entry = salesMap.get(i + 1);
        return { month: i + 1, income: calcIncome(entry) };
      })} />
    </div>
  );
}

function GoalsSection({ goals, year, onSaveGoal, monthlyData }: {
  goals: SalesGoal[];
  year: number;
  onSaveGoal: (goal: Omit<SalesGoal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  monthlyData: { month: number; income: number }[];
}) {
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [targetIncome, setTargetIncome] = useState(0);
  const [saving, setSaving] = useState(false);

  function startEdit(month: number) {
    const existing = goals.find(g => g.month === month);
    setTargetIncome(existing?.targetIncome ?? 0);
    setEditingMonth(month);
  }

  async function handleSave() {
    if (editingMonth === null) return;
    setSaving(true);
    try {
      await onSaveGoal({ year, month: editingMonth, targetIncome: targetIncome || undefined });
      setEditingMonth(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-slate-400" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Metas de Ingreso Mensual - {year}</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {MONTHS.map((name, i) => {
          const month = i + 1;
          const goal = goals.find(g => g.month === month);
          const actual = monthlyData.find(m => m.month === month)?.income ?? 0;
          const target = goal?.targetIncome ?? 0;
          const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
          const isEditing = editingMonth === month;

          return (
            <div key={month} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{name}</p>
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    min="0"
                    className="input-field !py-1 text-sm"
                    placeholder="Meta de ingreso"
                    value={targetIncome || ''}
                    onFocus={e => e.target.select()}
                    onChange={e => setTargetIncome(Number(e.target.value) || 0)}
                  />
                  <div className="flex gap-1">
                    <button onClick={handleSave} disabled={saving} className="btn-primary !py-1 !px-2 text-xs">
                      {saving ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditingMonth(null)} className="btn-secondary !py-1 !px-2 text-xs">X</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => startEdit(month)} className="cursor-pointer">
                  {target > 0 ? (
                    <>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-1">
                        <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-slate-500">{formatCurrency(actual)} / {formatCurrency(target)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sin meta - clic para definir</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
