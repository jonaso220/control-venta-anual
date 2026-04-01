import { useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, BarChart3, PieChart as PieIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import type { SalesEntry, PriceConfig, Expense, SalesGoal } from '../types';
import { MONTHS, EXPENSE_CATEGORIES } from '../types';

interface DashboardProps {
  sales: SalesEntry[];
  prices: PriceConfig;
  expenses: Expense[];
  year: number;
  goals: SalesGoal[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const PIE_COLORS: Record<string, string> = {
  impuestos: '#8b5cf6',
  prestamos: '#f97316',
  seguros: '#06b6d4',
  sueldos: '#3b82f6',
  vehiculo: '#f59e0b',
  otros: '#64748b',
};

export default function Dashboard({ sales, prices, expenses, year, goals }: DashboardProps) {
  const totalExpensesMonthly = useMemo(() => {
    return expenses.filter(e => e.isActive).reduce((acc, e) => acc + e.amount, 0);
  }, [expenses]);

  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const entry = sales.find(s => s.month === month);
      const sifones = entry?.sifones ?? 0;
      const l6 = entry?.litros6 ?? 0;
      const l12 = entry?.litros12 ?? 0;
      const l20 = entry?.litros20 ?? 0;

      const income =
        sifones * prices.sifones +
        l6 * prices.litros6 +
        l12 * prices.litros12 +
        l20 * prices.litros20;

      return {
        month: MONTHS[i].substring(0, 3),
        monthFull: MONTHS[i],
        ingresos: income,
        gastos: totalExpensesMonthly,
        ganancia: income - totalExpensesMonthly,
        sifones,
        litros6: l6,
        litros12: l12,
        litros20: l20,
        totalUnidades: sifones + l6 + l12 + l20,
      };
    });
  }, [sales, prices, totalExpensesMonthly]);

  const totals = useMemo(() => {
    const totalIncome = monthlyData.reduce((a, m) => a + m.ingresos, 0);
    const totalExpenses = totalExpensesMonthly * 12;
    const totalUnits = monthlyData.reduce((a, m) => a + m.totalUnidades, 0);
    return {
      income: totalIncome,
      expenses: totalExpenses,
      profit: totalIncome - totalExpenses,
      units: totalUnits,
    };
  }, [monthlyData, totalExpensesMonthly]);

  const expensesByCategory = useMemo(() => {
    const active = expenses.filter(e => e.isActive);
    const grouped: Record<string, number> = {};
    active.forEach(e => {
      grouped[e.category] = (grouped[e.category] || 0) + e.amount;
    });
    return Object.entries(grouped).map(([category, amount]) => ({
      name: EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES] || category,
      value: amount,
      color: PIE_COLORS[category] || '#64748b',
    }));
  }, [expenses]);

  // Month-over-month variation for current month
  const currentMonth = new Date().getMonth(); // 0-indexed
  const variation = useMemo(() => {
    if (currentMonth === 0) return null;
    const curr = monthlyData[currentMonth]?.ingresos || 0;
    const prev = monthlyData[currentMonth - 1]?.ingresos || 0;
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [monthlyData, currentMonth]);

  const isProfit = totals.profit >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h2>
        <p className="text-slate-500 dark:text-slate-400">Resumen del año {year}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Ingresos Totales</span>
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totals.income)}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Año {year}</span>
            {variation !== null && (
              <span className={`text-xs font-medium ${variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {variation >= 0 ? '+' : ''}{variation.toFixed(1)}% vs mes anterior
              </span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Gastos Totales</span>
            <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totals.expenses)}</span>
          <span className="text-xs text-slate-400">{formatCurrency(totalExpensesMonthly)}/mes</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Ganancia Neta</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isProfit ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {isProfit ? (
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
              )}
            </div>
          </div>
          <span className={`text-2xl font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(totals.profit)}
          </span>
          <span className="text-xs text-slate-400">Despues de gastos</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Unidades Vendidas</span>
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totals.units.toLocaleString()}</span>
          <span className="text-xs text-slate-400">Total del año</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Ingresos vs Gastos</h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Ganancia Mensual</h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Line type="monotone" dataKey="ganancia" name="Ganancia" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Ventas por Producto</h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <Legend />
                <Bar dataKey="sifones" name="Sifones" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="litros6" name="6 Litros" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
                <Bar dataKey="litros12" name="12 Litros" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="litros20" name="20 Litros" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Gastos por Categoria</h3>
          </div>
          <div className="h-72">
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No hay gastos activos
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Goals Progress */}
      {goals.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Metas de Venta</h3>
          </div>
          <div className="space-y-3">
            {goals.map(goal => {
              const data = monthlyData[goal.month - 1];
              if (!data || !goal.targetIncome) return null;
              const actual = data.ingresos;
              const pct = goal.targetIncome > 0 ? Math.min((actual / goal.targetIncome) * 100, 100) : 0;
              return (
                <div key={goal.month} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{MONTHS[goal.month - 1]}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatCurrency(actual)} / {formatCurrency(goal.targetIncome)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export { formatCurrency };
