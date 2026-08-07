import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUseLegacyExpenseFallback,
  isExpenseHistorySnapshotConsistent,
} from '../src/services/firestore.ts';
import type { Expense, FixedExpenseVersion } from '../src/types.ts';

const currentSnapshot = {
  name: 'Alquiler',
  amount: 200,
  dueDate: 'Mensual',
  category: 'otros' as const,
  isActive: true,
  notes: 'Local',
};

function version(
  effectiveFrom: string,
  overrides: Partial<FixedExpenseVersion> = {},
): FixedExpenseVersion {
  return {
    expenseId: 'fixed-1',
    effectiveFrom,
    ...currentSnapshot,
    ...overrides,
  };
}

function migratedExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'fixed-1',
    ...currentSnapshot,
    historyVersion: 1,
    latestEffectiveFrom: '2026-08',
    ...overrides,
  };
}

test('el fallback de reglas antiguas solo acepta padres completamente legacy', () => {
  const legacy: Expense = { id: 'legacy', ...currentSnapshot };

  assert.equal(canUseLegacyExpenseFallback([legacy]), true);
  assert.equal(canUseLegacyExpenseFallback([legacy, migratedExpense()]), false);
});

test('un historial consistente exige que la version maxima coincida con el padre', () => {
  const versions = new Map<string, FixedExpenseVersion[]>([[
    'fixed-1',
    [version('2000-01', { amount: 100 }), version('2026-08')],
  ]]);

  assert.equal(isExpenseHistorySnapshotConsistent([migratedExpense()], versions), true);

  versions.get('fixed-1')?.push(version('2026-09', { amount: 300 }));
  assert.equal(isExpenseHistorySnapshotConsistent([migratedExpense()], versions), false);
});

test('un historial mezclado rechaza snapshot distinto, version ausente y huerfanos', () => {
  assert.equal(isExpenseHistorySnapshotConsistent(
    [migratedExpense()],
    new Map([['fixed-1', [version('2026-08', { amount: 999 })]]]),
  ), false);

  assert.equal(isExpenseHistorySnapshotConsistent(
    [migratedExpense()],
    new Map(),
  ), false);

  assert.equal(isExpenseHistorySnapshotConsistent(
    [migratedExpense()],
    new Map([
      ['fixed-1', [version('2026-08')]],
      ['orphan', [version('2025-01', { expenseId: 'orphan' })]],
    ]),
  ), false);
});
