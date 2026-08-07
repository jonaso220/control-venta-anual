import type { Expense, PriceConfig, SalesEntry, VariableExpense } from '../types';
import { EXPENSE_CATEGORIES, MONTHS } from '../types';
import {
  buildMonthlyFinancialResults,
  calculateSalesMargin,
  getSalesMargins,
  isValidProductAmounts,
} from '../domain/finance';

/**
 * Generates a year-scoped analysis workbook. It is deliberately separate from
 * the restorable JSON backup because it only includes the selected year.
 */
export async function exportYearExcel(
  sales: SalesEntry[],
  fixedExpenses: Expense[],
  variableExpenses: VariableExpense[],
  margins: PriceConfig,
  year: number,
): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const salesByMonth = new Map(sales.map(entry => [entry.month, entry]));
  const financialMonths = buildMonthlyFinancialResults({
    sales,
    margins,
    fixedExpenses,
    variableExpenses,
    year,
  });

  const summaryData = financialMonths.map((result, index) => ({
    Mes: MONTHS[index],
    'Margen bruto': result.grossMargin,
    'Gastos fijos': result.fixedExpenses,
    'Gastos variables': result.variableExpenses,
    'Gastos totales': result.totalExpenses,
    'Resultado neto': result.netResult,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), 'Resumen');

  const salesData = MONTHS.map((month, index) => {
    const entry = salesByMonth.get(index + 1);
    const appliedMargins = entry ? getSalesMargins(entry, margins) : margins;
    return {
      Mes: month,
      Sifones: entry?.sifones ?? 0,
      '6 Litros': entry?.litros6 ?? 0,
      '12 Litros': entry?.litros12 ?? 0,
      '20 Litros': entry?.litros20 ?? 0,
      'Total unidades': entry
        ? entry.sifones + entry.litros6 + entry.litros12 + entry.litros20
        : 0,
      'Margen unitario sifones': appliedMargins.sifones,
      'Margen unitario 6L': appliedMargins.litros6,
      'Margen unitario 12L': appliedMargins.litros12,
      'Margen unitario 20L': appliedMargins.litros20,
      'Margen bruto': calculateSalesMargin(entry, margins),
      'Origen del margen': !entry
        ? 'Sin venta'
        : isValidProductAmounts(entry.marginSnapshot)
          ? 'Snapshot histórico'
          : 'Configuración actual (registro legado)',
    };
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesData), 'Ventas');

  const fixedData = fixedExpenses.map(expense => ({
    Nombre: expense.name,
    Categoría: EXPENSE_CATEGORIES[expense.category],
    Vencimiento: expense.dueDate,
    Monto: expense.amount,
    Estado: expense.isActive ? 'Activo' : 'Inactivo',
    Notas: expense.notes || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fixedData), 'Gastos Fijos');

  const variableData = variableExpenses.map(expense => ({
    Fecha: expense.date,
    Descripción: expense.description,
    Categoría: EXPENSE_CATEGORIES[expense.category],
    Monto: expense.amount,
    Notas: expense.notes || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(variableData), 'Gastos Variables');

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    Sifones: margins.sifones,
    '6 Litros': margins.litros6,
    '12 Litros': margins.litros12,
    '20 Litros': margins.litros20,
  }]), 'Márgenes actuales');

  XLSX.writeFile(workbook, `informe_anual_${year}.xlsx`);
}
