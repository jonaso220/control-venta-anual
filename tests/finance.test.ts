import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMonthlyFinancialResults,
  calculateSalesMargin,
  freezeSalesMargins,
  getElapsedMonthCount,
  getGoalTargetMargin,
  hasConfiguredMargins,
  projectAnnualTotals,
  sumFinancialResults,
} from '../src/domain/finance.ts';
import type { Expense, PriceConfig, SalesEntry, VariableExpense } from '../src/types.ts';

const originalMargins: PriceConfig = {
  sifones: 10,
  litros6: 20,
  litros12: 30,
  litros20: 40,
};

const changedMargins: PriceConfig = {
  sifones: 100,
  litros6: 100,
  litros12: 100,
  litros20: 100,
};

const legacySale: SalesEntry = {
  year: 2026,
  month: 1,
  sifones: 1,
  litros6: 2,
  litros12: 3,
  litros20: 4,
};

test('un snapshot conserva el margen historico cuando cambia la configuracion', () => {
  const frozen = freezeSalesMargins(legacySale, originalMargins);

  assert.equal(calculateSalesMargin(frozen, originalMargins), 300);
  assert.equal(calculateSalesMargin(frozen, changedMargins), 300);
  assert.deepEqual(frozen.marginSnapshot, originalMargins);
});

test('un registro legacy sigue calculando con el margen de respaldo', () => {
  assert.equal(calculateSalesMargin(legacySale, originalMargins), 300);
  assert.equal(calculateSalesMargin(legacySale, changedMargins), 1000);
});

test('el resumen mensual suma gastos fijos activos y variables del mes correcto', () => {
  const fixedExpenses: Expense[] = [
    { name: 'Fijo', amount: 50, dueDate: 'Mensual', category: 'otros', isActive: true },
    { name: 'Inactivo', amount: 999, dueDate: 'Mensual', category: 'otros', isActive: false },
  ];
  const variableExpenses: VariableExpense[] = [
    { date: '2026-01-05', description: 'Enero', amount: 25, category: 'otros' },
    { date: '2026-02-05', description: 'Febrero', amount: 75, category: 'otros' },
    { date: '2025-01-05', description: 'Otro año', amount: 500, category: 'otros' },
  ];

  const months = buildMonthlyFinancialResults({
    sales: [freezeSalesMargins(legacySale, originalMargins)],
    margins: changedMargins,
    fixedExpenses,
    variableExpenses,
    year: 2026,
  });

  assert.deepEqual(months[0], {
    month: 1,
    grossMargin: 300,
    fixedExpenses: 50,
    variableExpenses: 25,
    totalExpenses: 75,
    netResult: 225,
    units: { sifones: 1, litros6: 2, litros12: 3, litros20: 4 },
    totalUnits: 10,
  });
  assert.equal(months[1]?.totalExpenses, 125);
  assert.equal(months[1]?.netResult, -125);

  const accumulated = sumFinancialResults(months.slice(0, 2));
  assert.deepEqual(accumulated, {
    grossMargin: 300,
    fixedExpenses: 100,
    variableExpenses: 100,
    totalExpenses: 200,
    netResult: 100,
    totalUnits: 10,
  });
  assert.deepEqual(projectAnnualTotals(accumulated, 2, 50), {
    grossMargin: 1800,
    fixedExpenses: 600,
    variableExpenses: 600,
    totalExpenses: 1200,
    netResult: 600,
    totalUnits: 60,
  });
});

test('el periodo acumulado distingue años pasados, actuales y futuros', () => {
  const now = new Date(2026, 7, 7);
  assert.equal(getElapsedMonthCount(2025, now), 12);
  assert.equal(getElapsedMonthCount(2026, now), 8);
  assert.equal(getElapsedMonthCount(2027, now), 0);
});

test('las metas nuevas tienen prioridad y las metas antiguas siguen funcionando', () => {
  assert.equal(getGoalTargetMargin({ year: 2026, month: 1, targetMargin: 200 }), 200);
  assert.equal(getGoalTargetMargin({ year: 2026, month: 1, targetIncome: 150 }), 150);
  assert.equal(getGoalTargetMargin({ year: 2026, month: 1, targetMargin: 200, targetIncome: 150 }), 200);
});

test('cuatro margenes en cero se consideran configuracion pendiente', () => {
  assert.equal(hasConfiguredMargins({ sifones: 0, litros6: 0, litros12: 0, litros20: 0 }), false);
  assert.equal(hasConfiguredMargins({ sifones: 0, litros6: 1, litros12: 0, litros20: 0 }), true);
});
