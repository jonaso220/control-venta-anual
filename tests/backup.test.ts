import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BackupValidationError,
  validateFullBackup,
  type FullBackup,
} from '../src/services/backup.ts';

const timestamp = '2025-01-02T03:04:05.000Z';
const emptyCounts = {
  sales: 0,
  expenses: 0,
  fixedExpenseVersions: 0,
  variableExpenses: 0,
  config: 0,
  priceHistory: 0,
  goals: 0,
  total: 0,
};

function emptyBackup(): FullBackup {
  return {
    schemaVersion: 2,
    app: 'control-venta-anual',
    exportedAt: timestamp,
    years: [],
    counts: { ...emptyCounts },
    collections: {
      sales: [],
      expenses: [],
      fixedExpenseVersions: [],
      variableExpenses: [],
      config: [],
      priceHistory: [],
      goals: [],
    },
  };
}

function legacyEmptyBackup(): unknown {
  const backup = JSON.parse(JSON.stringify(emptyBackup())) as Record<string, unknown>;
  backup.schemaVersion = 1;
  const counts = backup.counts as Record<string, unknown>;
  const collections = backup.collections as Record<string, unknown>;
  delete counts.fixedExpenseVersions;
  delete collections.fixedExpenseVersions;
  return backup;
}

function versionedExpenseBackup(): FullBackup {
  const backup = emptyBackup();
  backup.years = [2026];
  backup.collections.expenses.push({
    id: 'fixed-1',
    data: {
      name: 'Alquiler',
      amount: 200,
      dueDate: 'Mensual',
      category: 'otros',
      isActive: true,
      historyVersion: 1,
      latestEffectiveFrom: '2026-08',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    timestampPaths: ['/createdAt', '/updatedAt'],
  });
  backup.collections.fixedExpenseVersions.push({
    id: 'fixed-1__2026-08',
    data: {
      expenseId: 'fixed-1',
      effectiveFrom: '2026-08',
      name: 'Alquiler',
      amount: 200,
      dueDate: 'Mensual',
      category: 'otros',
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    timestampPaths: ['/createdAt', '/updatedAt'],
  });
  backup.counts = {
    ...emptyCounts,
    expenses: 1,
    fixedExpenseVersions: 1,
    total: 2,
  };
  return backup;
}

function legacySalesBackup(): FullBackup {
  const backup = emptyBackup();
  backup.years = [2026];
  backup.collections.sales.push({
    id: '2026-01',
    data: {
      year: 2026,
      month: 1,
      sifones: 1,
      litros6: 2,
      litros12: 3,
      litros20: 4,
      updatedAt: timestamp,
    },
    timestampPaths: ['/updatedAt'],
  });
  backup.collections.config.push({
    id: 'prices-2026',
    data: {
      sifones: 10,
      litros6: 20,
      litros12: 30,
      litros20: 40,
      updatedAt: timestamp,
    },
    timestampPaths: ['/updatedAt'],
  });
  backup.counts = { ...emptyCounts, sales: 1, config: 1, total: 2 };
  return backup;
}

test('acepta un respaldo vacio con esquema y conteos coherentes', () => {
  assert.deepEqual(validateFullBackup(emptyBackup()), emptyBackup());
});

test('acepta respaldos v1 y los normaliza a v2 sin inventar versiones', () => {
  const validated = validateFullBackup(legacyEmptyBackup());
  assert.equal(validated.schemaVersion, 2);
  assert.deepEqual(validated.collections.fixedExpenseVersions, []);
  assert.equal(validated.counts.fixedExpenseVersions, 0);
});

test('migra un gasto fijo legacy a una versión base sin perder su historia', () => {
  const backup = emptyBackup();
  backup.collections.expenses.push({
    id: 'legacy-fixed',
    data: {
      name: 'Seguro',
      amount: 90,
      dueDate: 'Mensual',
      category: 'seguros',
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    timestampPaths: ['/createdAt', '/updatedAt'],
  });
  backup.counts = { ...emptyCounts, expenses: 1, total: 1 };

  const validated = validateFullBackup(backup);
  assert.equal(validated.collections.expenses[0]?.data.historyVersion, 1);
  assert.equal(validated.collections.expenses[0]?.data.latestEffectiveFrom, '2000-01');
  assert.equal(validated.collections.fixedExpenseVersions[0]?.id, 'legacy-fixed__2000-01');
  assert.equal(validated.counts.fixedExpenseVersions, 1);
  assert.equal(validated.counts.total, 2);
});

test('valida y conserva el historial versionado de gastos fijos', () => {
  assert.deepEqual(validateFullBackup(versionedExpenseBackup()), versionedExpenseBackup());
});

test('rechaza un historial de gastos incompleto o con IDs inconsistentes', () => {
  const missingVersion = versionedExpenseBackup();
  missingVersion.collections.fixedExpenseVersions = [];
  missingVersion.counts = { ...emptyCounts, expenses: 1, total: 1 };
  assert.throws(() => validateFullBackup(missingVersion), /declara historial pero no contiene versiones/);

  const badId = versionedExpenseBackup();
  badId.collections.fixedExpenseVersions[0]!.id = 'otro__2026-08';
  assert.throws(() => validateFullBackup(badId), /expenseId__effectiveFrom/);

  const mismatchedLatestSnapshot = versionedExpenseBackup();
  mismatchedLatestSnapshot.collections.expenses[0]!.data.amount = 999;
  mismatchedLatestSnapshot.collections.expenses[0]!.data.isActive = false;
  assert.throws(
    () => validateFullBackup(mismatchedLatestSnapshot),
    /no coincide con el contenido de su última versión/,
  );
});

test('completa ventas legacy solo con los margenes del mismo año incluidos en el archivo', () => {
  const validated = validateFullBackup(legacySalesBackup());
  assert.deepEqual(validated.collections.sales[0]?.data.marginSnapshot, {
    sifones: 10,
    litros6: 20,
    litros12: 30,
    litros20: 40,
  });
});

test('rechaza una venta legacy si no puede reconstruir su snapshot antes de escribir', () => {
  const backup = legacySalesBackup();
  backup.collections.config = [];
  backup.counts = { ...emptyCounts, sales: 1, total: 1 };

  assert.throws(
    () => validateFullBackup(backup),
    (error: unknown) => error instanceof BackupValidationError && /falta config\/prices-2026/.test(error.message),
  );
});

test('rechaza campos desconocidos y conteos manipulados', () => {
  const unknownField = emptyBackup() as FullBackup & { role?: string };
  unknownField.role = 'admin';
  assert.throws(() => validateFullBackup(unknownField), BackupValidationError);

  const badCount = emptyBackup();
  badCount.counts.total = 99;
  assert.throws(() => validateFullBackup(badCount), BackupValidationError);
});

test('rechaza claves de contaminacion de prototipo provenientes de JSON', () => {
  const malicious = JSON.parse(JSON.stringify(emptyBackup())) as Record<string, unknown>;
  malicious.collections = JSON.parse('{"__proto__":[],"sales":[],"expenses":[],"fixedExpenseVersions":[],"variableExpenses":[],"config":[],"priceHistory":[],"goals":[]}');
  assert.throws(() => validateFullBackup(malicious), BackupValidationError);
});
