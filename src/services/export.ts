import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SalesEntry, Expense, PriceConfig, VariableExpense } from '../types';
import { MONTHS, EXPENSE_CATEGORIES } from '../types';

function formatCurrencyPlain(value: number): string {
  return new Intl.NumberFormat('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

// Export Sales to Excel
export function exportSalesExcel(sales: SalesEntry[], prices: PriceConfig, year: number) {
  const data = MONTHS.map((month, i) => {
    const entry = sales.find(s => s.month === i + 1);
    const sifones = entry?.sifones ?? 0;
    const l6 = entry?.litros6 ?? 0;
    const l12 = entry?.litros12 ?? 0;
    const l20 = entry?.litros20 ?? 0;
    const income = sifones * prices.sifones + l6 * prices.litros6 + l12 * prices.litros12 + l20 * prices.litros20;
    return {
      Mes: month,
      Sifones: sifones,
      '6 Litros': l6,
      '12 Litros': l12,
      '20 Litros': l20,
      'Total Unidades': sifones + l6 + l12 + l20,
      Ingreso: income,
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Ventas ${year}`);
  XLSX.writeFile(wb, `ventas_${year}.xlsx`);
}

// Export Sales to PDF
export function exportSalesPDF(sales: SalesEntry[], prices: PriceConfig, year: number) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Ventas - ${year}`, 14, 20);

  const rows = MONTHS.map((month, i) => {
    const entry = sales.find(s => s.month === i + 1);
    const sifones = entry?.sifones ?? 0;
    const l6 = entry?.litros6 ?? 0;
    const l12 = entry?.litros12 ?? 0;
    const l20 = entry?.litros20 ?? 0;
    const income = sifones * prices.sifones + l6 * prices.litros6 + l12 * prices.litros12 + l20 * prices.litros20;
    return [month, sifones, l6, l12, l20, sifones + l6 + l12 + l20, `$ ${formatCurrencyPlain(income)}`];
  });

  autoTable(doc, {
    startY: 30,
    head: [['Mes', 'Sifones', '6L', '12L', '20L', 'Total Und.', 'Ingreso']],
    body: rows,
  });

  doc.save(`ventas_${year}.pdf`);
}

// Export Expenses to Excel
export function exportExpensesExcel(fixedExpenses: Expense[], variableExpenses: VariableExpense[], year: number) {
  const fixedData = fixedExpenses.map(e => ({
    Nombre: e.name,
    Categoria: EXPENSE_CATEGORIES[e.category],
    Vencimiento: e.dueDate,
    Monto: e.amount,
    Estado: e.isActive ? 'Activo' : 'Inactivo',
    Notas: e.notes || '',
  }));

  const varData = variableExpenses.map(e => ({
    Fecha: e.date,
    Descripcion: e.description,
    Categoria: EXPENSE_CATEGORIES[e.category],
    Monto: e.amount,
    Notas: e.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fixedData), 'Gastos Fijos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(varData), 'Gastos Variables');
  XLSX.writeFile(wb, `gastos_${year}.xlsx`);
}

// Full backup as Excel with all data
export function exportFullBackup(
  sales: SalesEntry[],
  fixedExpenses: Expense[],
  variableExpenses: VariableExpense[],
  prices: PriceConfig,
  year: number
) {
  const wb = XLSX.utils.book_new();

  // Sales sheet
  const salesData = MONTHS.map((month, i) => {
    const entry = sales.find(s => s.month === i + 1);
    return {
      Mes: month,
      Sifones: entry?.sifones ?? 0,
      '6 Litros': entry?.litros6 ?? 0,
      '12 Litros': entry?.litros12 ?? 0,
      '20 Litros': entry?.litros20 ?? 0,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'Ventas');

  // Fixed expenses
  const fixedData = fixedExpenses.map(e => ({
    Nombre: e.name,
    Categoria: EXPENSE_CATEGORIES[e.category],
    Vencimiento: e.dueDate,
    Monto: e.amount,
    Estado: e.isActive ? 'Activo' : 'Inactivo',
    Notas: e.notes || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fixedData), 'Gastos Fijos');

  // Variable expenses
  const varData = variableExpenses.map(e => ({
    Fecha: e.date,
    Descripcion: e.description,
    Categoria: EXPENSE_CATEGORIES[e.category],
    Monto: e.amount,
    Notas: e.notes || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(varData), 'Gastos Variables');

  // Prices
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    Sifones: prices.sifones,
    '6 Litros': prices.litros6,
    '12 Litros': prices.litros12,
    '20 Litros': prices.litros20,
  }]), 'Precios');

  XLSX.writeFile(wb, `backup_${year}.xlsx`);
}

// Full backup as JSON
export function exportFullBackupJSON(
  sales: SalesEntry[],
  fixedExpenses: Expense[],
  variableExpenses: VariableExpense[],
  prices: PriceConfig,
  year: number
) {
  const data = { year, sales, fixedExpenses, variableExpenses, prices };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_${year}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
