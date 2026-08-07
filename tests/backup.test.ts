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
  variableExpenses: 0,
  config: 0,
  priceHistory: 0,
  goals: 0,
  total: 0,
};

function emptyBackup(): FullBackup {
  return {
    schemaVersion: 1,
    app: 'control-venta-anual',
    exportedAt: timestamp,
    years: [],
    counts: { ...emptyCounts },
    collections: {
      sales: [],
      expenses: [],
      variableExpenses: [],
      config: [],
      priceHistory: [],
      goals: [],
    },
  };
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
  malicious.collections = JSON.parse('{"__proto__":[],"sales":[],"expenses":[],"variableExpenses":[],"config":[],"priceHistory":[],"goals":[]}');
  assert.throws(() => validateFullBackup(malicious), BackupValidationError);
});
