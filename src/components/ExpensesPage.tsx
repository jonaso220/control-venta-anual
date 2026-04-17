import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Save, Receipt, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import type { Expense, ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import { formatCurrency } from './Dashboard';

interface ExpensesPageProps {
  expenses: Expense[];
  onSave: (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EMPTY_EXPENSE: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  amount: 0,
  dueDate: '',
  category: 'otros',
  isActive: true,
  notes: '',
};

type SortKey = 'name' | 'category' | 'dueDate' | 'amount' | 'isActive';
type SortDir = 'asc' | 'desc';

export default function ExpensesPage({ expenses, onSave, onDelete }: ExpensesPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_EXPENSE);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const totalActive = expenses.filter(e => e.isActive).reduce((a, e) => a + e.amount, 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filteredExpenses = useMemo(() => {
    let list = expenses;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q));
    }
    if (filterCategory) list = list.filter(e => e.category === filterCategory);
    if (filterStatus === 'active') list = list.filter(e => e.isActive);
    if (filterStatus === 'inactive') list = list.filter(e => !e.isActive);
    return list;
  }, [expenses, searchText, filterCategory, filterStatus]);

  const sortedExpenses = useMemo(() => {
    if (!sortKey) return filteredExpenses;
    return [...filteredExpenses].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'dueDate': cmp = a.dueDate.localeCompare(b.dueDate); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'isActive': cmp = (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filteredExpenses, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }


  function startEditing(expense: Expense) {
    setForm({
      name: expense.name,
      amount: expense.amount,
      dueDate: expense.dueDate,
      category: expense.category,
      isActive: expense.isActive,
      notes: expense.notes || '',
    });
    setEditingId(expense.id!);
    setIsAdding(false);
  }

  function startAdding() {
    setForm(EMPTY_EXPENSE);
    setIsAdding(true);
    setEditingId(null);
  }

  function cancel() {
    setEditingId(null);
    setIsAdding(false);
    setForm(EMPTY_EXPENSE);
  }

  async function handleSave() {
    if (!form.name.trim() || form.amount <= 0) return;
    setSaving(true);
    try {
      await onSave(form, editingId ?? undefined);
      cancel();
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const expense = expenses.find(e => e.id === id);
    if (!confirm(`Eliminar "${expense?.name ?? 'gasto'}"?`)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch {
      // Error handled by parent
    } finally {
      setDeletingId(null);
    }
  }

  const categoryColors: Record<ExpenseCategory, string> = {
    impuestos: 'bg-purple-100 text-purple-700',
    prestamos: 'bg-orange-100 text-orange-700',
    seguros: 'bg-cyan-100 text-cyan-700',
    sueldos: 'bg-blue-100 text-blue-700',
    vehiculo: 'bg-amber-100 text-amber-700',
    otros: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gastos Fijos</h2>
          <p className="text-slate-500 dark:text-slate-400">Administra tus gastos mensuales</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="stat-card !p-3 !flex-row !items-center !gap-3">
            <Receipt className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-xs text-slate-400">Total Mensual</p>
              <p className="font-bold text-red-600">{formatCurrency(totalActive)}</p>
            </div>
          </div>
          <button onClick={startAdding} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Agregar Gasto
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" className="input-field !pl-9" placeholder="Buscar gasto..." value={searchText} onChange={e => setSearchText(e.target.value)} />
        </div>
        <select className="input-field w-full sm:!w-auto sm:flex-none" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Todas las categorias</option>
          {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select className="input-field w-full sm:!w-auto sm:flex-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {isAdding && (
        <div className="card border-blue-200 bg-blue-50/30 dark:bg-blue-900/10 dark:border-blue-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Nuevo Gasto</h3>
          <FormFields form={form} setForm={setForm} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cancel} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      )}

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {sortedExpenses.length === 0 ? (
          <div className="card text-center text-slate-400 py-8">
            No hay gastos registrados. Haz clic en "Agregar Gasto" para comenzar.
          </div>
        ) : (
          sortedExpenses.map(expense => {
            const isEditing = editingId === expense.id;
            if (isEditing) {
              return (
                <div key={expense.id} className="card !p-4 border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10">
                  <FormFields form={form} setForm={setForm} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2 !py-2">
                      <Save className="w-4 h-4" />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={cancel} className="btn-secondary !py-2">Cancelar</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={expense.id} className={`card !p-4 ${!expense.isActive ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{expense.name}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[expense.category]}`}>
                        {EXPENSE_CATEGORIES[expense.category]}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${expense.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                        {expense.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditing(expense)} className="btn-icon" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id!)}
                      disabled={deletingId === expense.id}
                      className="btn-icon !text-red-400 hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/30"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400">Vencimiento</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{expense.dueDate || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Monto</p>
                    <p className="font-semibold text-red-600">{formatCurrency(expense.amount)}</p>
                  </div>
                </div>
                {expense.notes && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 break-words">{expense.notes}</p>
                )}
              </div>
            );
          })
        )}
        {sortedExpenses.length > 0 && (
          <div className="card !p-4 bg-slate-50 dark:bg-slate-800/80">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Total (activos)</span>
              <span className="font-bold text-red-600">{formatCurrency(totalActive)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block card !p-0 overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="table-header">
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                <span className="inline-flex items-center gap-1">Nombre <SortIcon col="name" /></span>
              </th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('category')}>
                <span className="inline-flex items-center gap-1">Categoria <SortIcon col="category" /></span>
              </th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('dueDate')}>
                <span className="inline-flex items-center gap-1">Vencimiento <SortIcon col="dueDate" /></span>
              </th>
              <th className="px-6 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                <span className="inline-flex items-center gap-1 justify-end">Monto <SortIcon col="amount" /></span>
              </th>
              <th className="px-6 py-3 text-center cursor-pointer select-none" onClick={() => toggleSort('isActive')}>
                <span className="inline-flex items-center gap-1 justify-center">Estado <SortIcon col="isActive" /></span>
              </th>
              <th className="px-6 py-3">Notas</th>
              <th className="px-6 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {sortedExpenses.map(expense => {
              const isEditing = editingId === expense.id;

              if (isEditing) {
                return (
                  <tr key={expense.id} className="bg-blue-50 dark:bg-blue-900/20">
                    <td colSpan={7} className="px-6 py-4">
                      <FormFields form={form} setForm={setForm} />
                      <div className="flex gap-2 mt-3">
                        <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
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
                <tr key={expense.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${!expense.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{expense.name}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[expense.category]}`}>
                      {EXPENSE_CATEGORIES[expense.category]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-600 dark:text-slate-300 text-sm">{expense.dueDate}</td>
                  <td className="px-6 py-3 text-right font-medium text-red-600">{formatCurrency(expense.amount)}</td>
                  <td className="px-6 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${expense.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                      {expense.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400 text-sm">{expense.notes || '-'}</td>
                  <td className="px-6 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => startEditing(expense)} className="btn-icon" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id!)}
                        disabled={deletingId === expense.id}
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
            {expenses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                  No hay gastos registrados. Haz clic en "Agregar Gasto" para comenzar.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100">
              <td className="px-6 py-3" colSpan={3}>Total (activos)</td>
              <td className="px-6 py-3 text-right text-red-600">{formatCurrency(totalActive)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FormFields({ form, setForm }: {
  form: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nombre</label>
        <input
          type="text"
          className="input-field"
          placeholder="Ej: BPS"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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
          onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Vencimiento</label>
        <input
          type="text"
          className="input-field"
          placeholder="Ej: 19 de c/mes"
          value={form.dueDate}
          onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
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
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Estado</label>
        <select
          className="input-field"
          value={form.isActive ? 'active' : 'inactive'}
          onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'active' }))}
        >
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notas</label>
        <input
          type="text"
          className="input-field"
          placeholder="Ej: Detalle del gasto"
          value={form.notes || ''}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
    </div>
  );
}
