import { lazy, Suspense, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, BarChart3 } from 'lucide-react';
import type { SalesEntry, PriceConfig, Expense, SalesGoal, VariableExpense } from '../types';
import { MONTHS, EXPENSE_CATEGORIES } from '../types';
import {
  buildMonthlyFinancialResults,
  getAnnualProjectionPeriod,
  getFixedExpenseSnapshotForMonth,
  getGoalTargetMargin,
  projectAnnualTotals,
  sumFinancialResults,
} from '../domain/finance';
import { formatCurrency } from '../utils/format';
import SectionErrorBoundary from './SectionErrorBoundary';

const DashboardCharts = lazy(() => import('./DashboardCharts'));

interface DashboardProps {
  sales: SalesEntry[];
  prices: PriceConfig;
  expenses: Expense[];
  variableExpenses: VariableExpense[];
  year: number;
  goals: SalesGoal[];
}

const PIE_COLORS: Record<string, string> = {
  impuestos: '#8b5cf6',
  prestamos: '#f97316',
  seguros: '#06b6d4',
  sueldos: '#3b82f6',
  vehiculo: '#f59e0b',
  otros: '#64748b',
};

export default function Dashboard({ sales, prices, expenses, variableExpenses, year, goals }: DashboardProps) {
  const financialMonths = useMemo(() => buildMonthlyFinancialResults({
    sales,
    margins: prices,
    fixedExpenses: expenses,
    variableExpenses,
    year,
  }), [sales, prices, expenses, variableExpenses, year]);

  const monthlyData = useMemo(() => financialMonths.map((result, index) => ({
    month: MONTHS[index].substring(0, 3),
    monthFull: MONTHS[index],
    margenBruto: result.grossMargin,
    gastos: result.totalExpenses,
    resultado: result.netResult,
    sifones: result.units.sifones,
    litros6: result.units.litros6,
    litros12: result.units.litros12,
    litros20: result.units.litros20,
    totalUnidades: result.totalUnits,
  })), [financialMonths]);

  const projectionPeriod = getAnnualProjectionPeriod(year);
  const elapsedMonths = projectionPeriod.elapsedMonths;
  const chartData = monthlyData.slice(0, elapsedMonths);

  const totals = useMemo(() => {
    return sumFinancialResults(financialMonths.slice(0, elapsedMonths));
  }, [financialMonths, elapsedMonths]);

  const annualProjection = useMemo(() => {
    const annualFixedExpenses = financialMonths.reduce((total, month) => total + month.fixedExpenses, 0);
    return projectAnnualTotals(totals, projectionPeriod.equivalentMonths, annualFixedExpenses);
  }, [totals, projectionPeriod.equivalentMonths, financialMonths]);

  const expensesByCategory = useMemo(() => {
    const grouped: Record<string, number> = {};

    expenses.forEach(expense => {
      for (let month = 1; month <= elapsedMonths; month += 1) {
        const snapshot = getFixedExpenseSnapshotForMonth(expense, year, month);
        if (!snapshot?.isActive || !Number.isFinite(snapshot.amount) || snapshot.amount < 0) continue;
        grouped[snapshot.category] = (grouped[snapshot.category] || 0) + snapshot.amount;
      }
    });

    variableExpenses.forEach(expense => {
      const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(expense.date);
      const expenseMonth = match ? Number(match[2]) : 0;
      if (
        !match ||
        Number(match[1]) !== year ||
        expenseMonth < 1 ||
        expenseMonth > elapsedMonths ||
        !Number.isFinite(expense.amount) ||
        expense.amount < 0
      ) return;
      grouped[expense.category] = (grouped[expense.category] || 0) + expense.amount;
    });

    return Object.entries(grouped).map(([category, amount]) => ({
      name: EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES] || category,
      value: amount,
      color: PIE_COLORS[category] || '#64748b',
    })).filter(entry => entry.value > 0);
  }, [expenses, variableExpenses, elapsedMonths, year]);

  const isProfit = totals.netResult >= 0;
  const projectionLabel = projectionPeriod.isCurrentYearPartial
    ? `Proyección anual (incluye ${MONTHS[elapsedMonths - 1]} parcial)`
    : elapsedMonths === 12
      ? 'Total anual'
      : 'Proyección anual';
  const periodLabel = elapsedMonths === 0
    ? 'El año seleccionado aún no comenzó'
    : projectionPeriod.isCurrentYearPartial
      ? `Acumulado hasta hoy (${MONTHS[elapsedMonths - 1]} parcial) de ${year}`
      : elapsedMonths === 12
        ? `Cierre del año ${year}`
        : `Acumulado hasta ${MONTHS[elapsedMonths - 1]} de ${year}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h2>
        <p className="text-slate-500 dark:text-slate-400">{periodLabel}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Margen bruto acumulado</span>
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">{formatCurrency(totals.grossMargin)}</span>
          <span className="text-xs text-slate-400">{projectionLabel}: {formatCurrency(annualProjection.grossMargin)}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Gastos acumulados</span>
            <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">{formatCurrency(totals.totalExpenses)}</span>
          <span className="text-xs text-slate-400">{projectionLabel}: {formatCurrency(annualProjection.totalExpenses)}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Resultado neto acumulado</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isProfit ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {isProfit ? (
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
              )}
            </div>
          </div>
          <span className={`text-xl sm:text-2xl font-bold break-words ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(totals.netResult)}
          </span>
          <span className="text-xs text-slate-400">{projectionLabel}: {formatCurrency(annualProjection.netResult)}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Unidades Vendidas</span>
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">{totals.totalUnits.toLocaleString()}</span>
          <span className="text-xs text-slate-400">{projectionLabel}: {Math.round(annualProjection.totalUnits).toLocaleString()}</span>
        </div>
      </div>

      <SectionErrorBoundary resetKey={`${year}:${chartData.length}`} message="No se pudieron cargar los gráficos.">
        <Suspense fallback={<DashboardChartsFallback />}>
          <DashboardCharts chartData={chartData} expensesByCategory={expensesByCategory} />
        </Suspense>
      </SectionErrorBoundary>
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
              const targetMargin = getGoalTargetMargin(goal);
              if (!data || !targetMargin) return null;
              const actual = data.margenBruto;
              const pct = targetMargin > 0 ? Math.min((actual / targetMargin) * 100, 100) : 0;
              return (
                <div key={goal.month} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{MONTHS[goal.month - 1]}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatCurrency(actual)} / {formatCurrency(targetMargin)} ({pct.toFixed(0)}%)
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

function DashboardChartsFallback() {
  return (
    <div role="status" aria-live="polite" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="card h-[336px] animate-pulse bg-slate-100 dark:bg-slate-800" />
      ))}
      <span className="sr-only">Cargando gráficos…</span>
    </div>
  );
}
