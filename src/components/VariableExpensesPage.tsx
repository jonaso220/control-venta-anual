import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Save, Wallet, Search } from 'lucide-react';
import type { VariableExpense, ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES, MONTHS } from '../types';
import { formatCurrency } from './Dashboard';

interface VariableExpensesPageProps {
  expenses: VariableExpense[];
  year: number;
  onSave: (expense: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EMPTY: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'> = {
  date: new Date().toISOString().split('T')[0],
  description: '',
  amount: 0,
  category: 'otros',
  notes: '',
};

const categoryColors: Record<ExpenseCategory, string> = {
  impuestos: 'bg-purple-100 text-purple-700',
  prestamos: 'bg-orange-100 text-orange-700',
  seguros: 'bg-cyan-100 text-cyan-700',
  sueldos: 'bg-blue-100 text-blue-700',
  vehiculo: 'bg-amber-100 text-amber-700',
  otros: 'bg-slate-100 text-slate-700 dark:bg-slate-600 dark:text-slate-200',
};

export default function VariableExpensesPage({ expenses, year, onSave, onDelete }: VariableExpensesPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  const filtered = useMemo(() => {
    let list = expenses;
    if (filterMonth !== null) {
      list = list.filter(e => {
        const m = parseInt(e.date.split('-')[1], 10);
        return m === filterMonth;
      });
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [expenses, filterMonth, searchText]);

  const totalFiltered = filtered.reduce((a, e) => a + e.amount, 0);
  const totalYear = expenses.reduce((a, e) => a + e.amount, 0);

  function startEditing(exp: VariableExpense) {
    setForm({
      date: exp.date,
      description: exp.description,
      amount: exp.amount,
      category: exp.category,
      notes: exp.notes || '',
    });
    setEditingId(exp.id!);
    setIsAdding(false);
  }

  function startAdding() {
    setForm({ ...EMPTY, date: `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}` });
    setIsAdding(true);
    setEditingId(null);
  }

  function cancel() {
    setEditingId(null);
    setIsAdding(false);
    setForm(EMPTY);
  }

  async function handleSave() {
    if (!form.description.trim() || form.amount <= 0) return;
    setSaving(true);
    try {
      await onSave(form, editingId ?? undefined);
      cancel();
    } catch {
      // handled by parent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const exp = expenses.find(e => e.id === id);
    if (!confirm(`Eliminar "${exp?.description ?? 'gasto'}"?`)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch {
      // handled by parent
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gastos Variables</h2>
          <p className="text-slate-500 dark:text-slate-400">Gastos puntuales y extraordinarios - {year}</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="stat-card !p-3 !flex-row !items-center !gap-3">
            <Wallet className="w-4 h-4 text-orange-500" />
            <div>
              <p className="text-xs text-slate-400">Total Año</p>
              <p className="font-bold text-orange-600">{formatCurrency(totalYear)}</p>
            </div>
          </div>
          <button onClick={startAdding} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Agregar Gasto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="input-field !pl-9"
            placeholder="Buscar..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <select
          className="input-field w-full sm:!w-auto sm:flex-none"
          value={filterMonth ?? ''}
          onChange={e => setFilterMonth(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      {isAdding && (
        <div className="card border-blue-200 bg-blue-50/30 dark:bg-blue-900/10 dark:border-blue-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Nuevo Gasto Variable</h3>
          <FormFields form={form} setForm={setForm} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving || !form.description.trim()} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cancel} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      )}

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card text-center text-slate-400 py-8">
            No hay gastos variables registrados.
          </div>
        ) : (
          filtered.map(exp => {
            const isEditing = editingId === exp.id;
            if (isEditing) {
              return (
                <div key={exp.id} className="card !p-4 border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10">
                  <FormFields form={form} setForm={setForm} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={handleSave} disabled={saving || !form.description.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2 !py-2">
                      <Save className="w-4 h-4" />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={cancel} className="btn-secondary !py-2">Cancelar</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={exp.id} className="card !p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{exp.description}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(exp.date)}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[exp.category]}`}>
                        {EXPENSE_CATEGORIES[exp.category]}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditing(exp)} className="btn-icon" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(exp.id!)}
                      disabled={deletingId === exp.id}
                      className="btn-icon !text-red-400 hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/30"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-slate-100 dark:border-slate-700">
                  {exp.notes ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 pr-3 break-words">{exp.notes}</p>
                  ) : <span />}
                  <p className="font-semibold text-orange-600 shrink-0">{formatCurrency(exp.amount)}</p>
                </div>
              </div>
            );
          })
        )}
        {filtered.length > 0 && (
          <div className="card !p-4 bg-slate-50 dark:bg-slate-800/80">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Total {filterMonth ? `(${MONTHS[filterMonth - 1]})` : '(filtrado)'}</span>
              <span className="font-bold text-orange-600">{formatCurrency(totalFiltered)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block card !p-0 overflow-x-auto">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="table-header">
              <th className="px-6 py-3">Fecha</th>
              <th className="px-6 py-3">Descripcion</th>
              <th className="px-6 py-3">Categoria</th>
              <th className="px-6 py-3 text-right">Monto</th>
              <th className="px-6 py-3">Notas</th>
              <th className="px-6 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(exp => {
              const isEditing = editingId === exp.id;

              if (isEditing) {
                return (
                  <tr key={exp.id} className="bg-blue-50 dark:bg-blue-900/20">
                    <td colSpan={6} className="px-6 py-4">
                      <FormFields form={form} setForm={setForm} />
                      <div className="flex gap-2 mt-3">
                        <button onClick={handleSave} disabled={saving || !form.description.trim()} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
                          <Save className="w-3 h-3" />
                          {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button onClick={cancel} className="btn-secondary !py-1.5 !px-3 text-xs">Cancelar</button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-300">{formatDate(exp.date)}</td>
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{exp.description}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[exp.category]}`}>
                      {EXPENSE_CATEGORIES[exp.category]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-orange-600">{formatCurrency(exp.amount)}</td>
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400 text-sm">{exp.notes || '-'}</td>
                  <td className="px-6 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => startEditing(exp)} className="btn-icon" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(exp.id!)}
                        disabled={deletingId === exp.id}
                        className="btn-icon !text-red-400 hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/30"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  No hay gastos variables registrados.
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-800 font-semibold">
                <td className="px-6 py-3" colSpan={3}>Total {filterMonth ? `(${MONTHS[filterMonth - 1]})` : '(filtrado)'}</td>
                <td className="px-6 py-3 text-right text-orange-600">{formatCurrency(totalFiltered)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function FormFields({ form, setForm }: {
  form: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'>;
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha</label>
        <input
          type="date"
          className="input-field"
          value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Descripcion</label>
        <input
          type="text"
          className="input-field"
          placeholder="Ej: Reparacion motor"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Monto ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="input-field"
          value={form.amount || ''}
          onFocus={e => e.target.select()}
          onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Categoria</label>
        <select
          className="input-field"
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
        >
          {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notas</label>
        <input
          type="text"
          className="input-field"
          placeholder="Opcional"
          value={form.notes || ''}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
    </div>
  );
}
