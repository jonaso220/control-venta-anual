import type {
  Expense,
  ExpenseSnapshot,
  PriceConfig,
  ProductAmounts,
  SalesEntry,
  SalesGoal,
  VariableExpense,
} from '../types';

const PRODUCT_KEYS = ['sifones', 'litros6', 'litros12', 'litros20'] as const;

export interface MonthlyFinancialResult {
  month: number;
  grossMargin: number;
  fixedExpenses: number;
  variableExpenses: number;
  totalExpenses: number;
  netResult: number;
  units: ProductAmounts;
  totalUnits: number;
}

export interface FrozenSalesEntry extends SalesEntry {
  marginSnapshot: ProductAmounts;
}

export interface FinancialTotals {
  grossMargin: number;
  fixedExpenses: number;
  variableExpenses: number;
  totalExpenses: number;
  netResult: number;
  totalUnits: number;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function copyProductAmounts(values: ProductAmounts): ProductAmounts {
  return {
    sifones: values.sifones,
    litros6: values.litros6,
    litros12: values.litros12,
    litros20: values.litros20,
  };
}

export function isValidProductAmounts(value: unknown): value is ProductAmounts {
  if (!value || typeof value !== 'object') return false;
  const amounts = value as Partial<Record<(typeof PRODUCT_KEYS)[number], unknown>>;
  return PRODUCT_KEYS.every(key => isNonNegativeFiniteNumber(amounts[key]));
}

export function hasConfiguredMargins(value: unknown): value is ProductAmounts {
  return isValidProductAmounts(value) && PRODUCT_KEYS.some(key => value[key] > 0);
}

/**
 * Los registros nuevos usan su snapshot. Los registros legacy usan el margen
 * vigente hasta que el servicio de persistencia los congele.
 */
export function getSalesMargins(entry: SalesEntry, fallbackMargins: PriceConfig): ProductAmounts {
  return isValidProductAmounts(entry.marginSnapshot)
    ? entry.marginSnapshot
    : copyProductAmounts(fallbackMargins);
}

export function freezeSalesMargins(entry: SalesEntry, fallbackMargins: PriceConfig): FrozenSalesEntry {
  return {
    ...entry,
    marginSnapshot: copyProductAmounts(getSalesMargins(entry, fallbackMargins)),
  };
}

export function calculateSalesMargin(entry: SalesEntry | undefined, fallbackMargins: PriceConfig): number {
  if (!entry) return 0;
  const margins = getSalesMargins(entry, fallbackMargins);
  return PRODUCT_KEYS.reduce((total, key) => total + entry[key] * margins[key], 0);
}

export function calculateFixedMonthlyExpenses(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => {
    return expense.isActive && isNonNegativeFiniteNumber(expense.amount)
      ? total + expense.amount
      : total;
  }, 0);
}

function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function toExpenseSnapshot(expense: ExpenseSnapshot): ExpenseSnapshot {
  return {
    name: expense.name,
    amount: expense.amount,
    dueDate: expense.dueDate,
    category: expense.category,
    isActive: expense.isActive,
    ...(expense.notes !== undefined ? { notes: expense.notes } : {}),
  };
}

/**
 * Devuelve el estado que regía en un mes concreto. Los gastos legacy, que no
 * tienen historial, mantienen el comportamiento anterior y aplican a todos los
 * meses. Un gasto ya migrado nunca usa por accidente el snapshot actual si sus
 * versiones están ausentes.
 */
export function getFixedExpenseSnapshotForMonth(
  expense: Expense,
  year: number,
  month: number,
): ExpenseSnapshot | null {
  const versions = expense.versions ?? [];
  if (versions.length === 0) {
    return expense.historyVersion === 1 ? null : toExpenseSnapshot(expense);
  }

  const targetMonth = formatYearMonth(year, month);
  const applicableVersion = versions
    .filter(version => /^\d{4}-(0[1-9]|1[0-2])$/.test(version.effectiveFrom))
    .filter(version => version.effectiveFrom <= targetMonth)
    .toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  return applicableVersion ? toExpenseSnapshot(applicableVersion) : null;
}

export function calculateFixedExpensesForMonth(
  expenses: Expense[],
  year: number,
  month: number,
): number {
  return expenses.reduce((total, expense) => {
    const snapshot = getFixedExpenseSnapshotForMonth(expense, year, month);
    return snapshot?.isActive && isNonNegativeFiniteNumber(snapshot.amount)
      ? total + snapshot.amount
      : total;
  }, 0);
}

export function calculateVariableExpensesByMonth(
  expenses: VariableExpense[],
  year: number,
): number[] {
  const totals = Array.from({ length: 12 }, () => 0);

  for (const expense of expenses) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(expense.date);
    if (!match || Number(match[1]) !== year || !isNonNegativeFiniteNumber(expense.amount)) continue;

    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex >= totals.length) continue;
    totals[monthIndex] += expense.amount;
  }

  return totals;
}

export function upsertVariableExpenseForYear(
  current: VariableExpense[],
  saved: VariableExpense,
  year: number,
): VariableExpense[] {
  const withoutEditedExpense = current.filter(expense => expense.id !== saved.id);
  if (Number(saved.date.slice(0, 4)) !== year) return withoutEditedExpense;
  return [...withoutEditedExpense, saved]
    .toSorted((a, b) => b.date.localeCompare(a.date));
}

export function buildMonthlyFinancialResults({
  sales,
  margins,
  fixedExpenses,
  variableExpenses,
  year,
}: {
  sales: SalesEntry[];
  margins: PriceConfig;
  fixedExpenses: Expense[];
  variableExpenses: VariableExpense[];
  year: number;
}): MonthlyFinancialResult[] {
  const salesByMonth = new Map(sales.map(entry => [entry.month, entry]));
  const variableByMonth = calculateVariableExpensesByMonth(variableExpenses, year);

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const month = monthIndex + 1;
    const entry = salesByMonth.get(month);
    const fixedMonthly = calculateFixedExpensesForMonth(fixedExpenses, year, month);
    const units: ProductAmounts = {
      sifones: entry?.sifones ?? 0,
      litros6: entry?.litros6 ?? 0,
      litros12: entry?.litros12 ?? 0,
      litros20: entry?.litros20 ?? 0,
    };
    const grossMargin = calculateSalesMargin(entry, margins);
    const monthlyVariableExpenses = variableByMonth[monthIndex] ?? 0;
    const totalExpenses = fixedMonthly + monthlyVariableExpenses;

    return {
      month,
      grossMargin,
      fixedExpenses: fixedMonthly,
      variableExpenses: monthlyVariableExpenses,
      totalExpenses,
      netResult: grossMargin - totalExpenses,
      units,
      totalUnits: PRODUCT_KEYS.reduce((total, key) => total + units[key], 0),
    };
  });
}

export function getElapsedMonthCount(year: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  if (year < currentYear) return 12;
  if (year > currentYear) return 0;
  return now.getMonth() + 1;
}

export interface AnnualProjectionPeriod {
  elapsedMonths: number;
  equivalentMonths: number;
  isCurrentYearPartial: boolean;
}

/**
 * Para el año actual, el divisor incluye los meses completos y la fracción de
 * días transcurrida del mes en curso. Así el 7 de agosto no cuenta como ocho
 * meses completos.
 */
export function getAnnualProjectionPeriod(
  year: number,
  now = new Date(),
): AnnualProjectionPeriod {
  const elapsedMonths = getElapsedMonthCount(year, now);
  if (year !== now.getFullYear()) {
    return {
      elapsedMonths,
      equivalentMonths: elapsedMonths,
      isCurrentYearPartial: false,
    };
  }

  const completedMonths = now.getMonth();
  const daysInCurrentMonth = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    elapsedMonths,
    equivalentMonths: completedMonths + (now.getDate() / daysInCurrentMonth),
    isCurrentYearPartial: now.getDate() < daysInCurrentMonth,
  };
}

export function sumFinancialResults(results: MonthlyFinancialResult[]): FinancialTotals {
  return results.reduce<FinancialTotals>((totals, month) => ({
    grossMargin: totals.grossMargin + month.grossMargin,
    fixedExpenses: totals.fixedExpenses + month.fixedExpenses,
    variableExpenses: totals.variableExpenses + month.variableExpenses,
    totalExpenses: totals.totalExpenses + month.totalExpenses,
    netResult: totals.netResult + month.netResult,
    totalUnits: totals.totalUnits + month.totalUnits,
  }), {
    grossMargin: 0,
    fixedExpenses: 0,
    variableExpenses: 0,
    totalExpenses: 0,
    netResult: 0,
    totalUnits: 0,
  });
}

export function projectAnnualTotals(
  accumulated: FinancialTotals,
  equivalentMonths: number,
  annualFixedExpenses: number,
): FinancialTotals {
  const annualizationFactor = equivalentMonths > 0 ? 12 / equivalentMonths : 0;
  const grossMargin = accumulated.grossMargin * annualizationFactor;
  const variableExpenses = accumulated.variableExpenses * annualizationFactor;
  const fixedExpenses = annualFixedExpenses;
  const totalExpenses = fixedExpenses + variableExpenses;

  return {
    grossMargin,
    fixedExpenses,
    variableExpenses,
    totalExpenses,
    netResult: grossMargin - totalExpenses,
    totalUnits: accumulated.totalUnits * annualizationFactor,
  };
}

export function getGoalTargetMargin(goal: SalesGoal): number | undefined {
  return goal.targetMargin ?? goal.targetIncome;
}
