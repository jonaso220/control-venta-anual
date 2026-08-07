import type { Expense, PriceConfig, SalesEntry, VariableExpense } from '../types';
import { EXPENSE_CATEGORIES, MONTHS } from '../types';
import {
  buildMonthlyFinancialResults,
  calculateSalesMargin,
  getFixedExpenseSnapshotForMonth,
  getSalesMargins,
  isValidProductAmounts,
} from '../domain/finance';

type ExportValue = string | number | boolean | Date;
type ExportRow = Record<string, ExportValue>;

function toSheetData(rows: ExportRow[], headers: string[]) {
  return [
    headers.map((header) => ({
      value: header,
      fontWeight: 'bold' as const,
      backgroundColor: '#E2E8F0',
      wrap: true,
    })),
    ...rows.map((row) => headers.map((header) => row[header])),
  ];
}

function columnWidths(headers: string[]) {
  return headers.map((header) => ({
    width: Math.min(32, Math.max(12, header.length + 2)),
  }));
}

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
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
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

  const fixedData = MONTHS.flatMap((month, monthIndex) => (
    fixedExpenses.flatMap(expense => {
      const snapshot = getFixedExpenseSnapshotForMonth(expense, year, monthIndex + 1);
      if (!snapshot) return [];
      return [{
        Mes: month,
        Nombre: snapshot.name,
        Categoría: EXPENSE_CATEGORIES[snapshot.category],
        Vencimiento: snapshot.dueDate,
        Monto: snapshot.amount,
        Estado: snapshot.isActive ? 'Activo' : 'Inactivo',
        Notas: snapshot.notes || '',
      }];
    })
  ));

  const variableData = variableExpenses.map(expense => ({
    Fecha: expense.date,
    Descripción: expense.description,
    Categoría: EXPENSE_CATEGORIES[expense.category],
    Monto: expense.amount,
    Notas: expense.notes || '',
  }));
  const marginsData = [{
    Sifones: margins.sifones,
    '6 Litros': margins.litros6,
    '12 Litros': margins.litros12,
    '20 Litros': margins.litros20,
  }];

  const sheets = [
    { sheet: 'Resumen', rows: summaryData, headers: Object.keys(summaryData[0]) },
    { sheet: 'Ventas', rows: salesData, headers: Object.keys(salesData[0]) },
    {
      sheet: 'Gastos Fijos',
      rows: fixedData,
      headers: ['Mes', 'Nombre', 'Categoría', 'Vencimiento', 'Monto', 'Estado', 'Notas'],
    },
    {
      sheet: 'Gastos Variables',
      rows: variableData,
      headers: ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Notas'],
    },
    { sheet: 'Márgenes actuales', rows: marginsData, headers: Object.keys(marginsData[0]) },
  ];

  await writeXlsxFile(
    sheets.map(({ sheet, rows, headers }) => ({
      sheet,
      data: toSheetData(rows, headers),
      columns: columnWidths(headers),
      stickyRowsCount: 1,
    })),
  ).toFile(`informe_anual_${year}.xlsx`);
}
