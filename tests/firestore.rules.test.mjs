import { after, afterEach, before } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BackupValidationError,
  restoreFullBackupToFirestore,
} from '../src/services/backup.ts';

const PROJECT_ID = 'demo-control-venta-anual-rules';
const RULES = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

function dbFor(uid, tokenOptions = { appAccess: true }) {
  return testEnv.authenticatedContext(uid, tokenOptions).firestore();
}

function unauthenticatedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function marginSnapshot() {
  return {
    sifones: 10,
    litros6: 20,
    litros12: 30,
    litros20: 40,
  };
}

const backupTimestamp = '2025-01-02T03:04:05.000Z';

function restoreBackup({
  sales = [],
  expenses = [],
  versions = [],
  variableExpenses = [],
  priceHistory = [],
} = {}) {
  const collections = {
    sales,
    expenses,
    fixedExpenseVersions: versions,
    variableExpenses,
    config: [],
    priceHistory,
    goals: [],
  };
  const counts = {
    sales: sales.length,
    expenses: expenses.length,
    fixedExpenseVersions: versions.length,
    variableExpenses: variableExpenses.length,
    config: 0,
    priceHistory: priceHistory.length,
    goals: 0,
    total: sales.length + expenses.length + versions.length + variableExpenses.length + priceHistory.length,
  };
  return {
    schemaVersion: 2,
    app: 'control-venta-anual',
    exportedAt: backupTimestamp,
    years: [2026],
    counts,
    collections,
  };
}

function legacyFixedRestoreBackup(expenseId) {
  return {
    schemaVersion: 1,
    app: 'control-venta-anual',
    exportedAt: backupTimestamp,
    years: [],
    counts: {
      sales: 0,
      expenses: 1,
      variableExpenses: 0,
      config: 0,
      priceHistory: 0,
      goals: 0,
      total: 1,
    },
    collections: {
      sales: [],
      expenses: [{
        id: expenseId,
        data: {
          name: 'Alquiler legacy',
          amount: 900,
          dueDate: 'Mensual',
          category: 'otros',
          isActive: true,
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
        timestampPaths: ['/createdAt', '/updatedAt'],
      }],
      variableExpenses: [],
      config: [],
      priceHistory: [],
      goals: [],
    },
  };
}

function fixedRestoreRecords() {
  const snapshot = {
    name: 'Combustible',
    amount: 1234.5,
    dueDate: 'Mensual',
    category: 'vehiculo',
    isActive: true,
    notes: 'Gasto operativo',
  };
  return {
    expense: {
      id: 'fixed-restore',
      data: {
        ...snapshot,
        historyVersion: 1,
        latestEffectiveFrom: '2026-08',
        createdAt: backupTimestamp,
        updatedAt: backupTimestamp,
      },
      timestampPaths: ['/createdAt', '/updatedAt'],
    },
    version: {
      id: 'fixed-restore__2026-08',
      data: {
        expenseId: 'fixed-restore',
        effectiveFrom: '2026-08',
        ...snapshot,
        createdAt: backupTimestamp,
        updatedAt: backupTimestamp,
      },
      timestampPaths: ['/createdAt', '/updatedAt'],
    },
  };
}

function salesData(overrides = {}) {
  return {
    year: 2026,
    month: 8,
    sifones: 10,
    litros6: 20,
    litros12: 30,
    litros20: 40,
    marginSnapshot: marginSnapshot(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function expenseData(overrides = {}) {
  return {
    name: 'Combustible',
    amount: 1234.5,
    dueDate: 'Mensual',
    category: 'vehiculo',
    isActive: true,
    notes: 'Gasto operativo',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function variableExpenseData(overrides = {}) {
  return {
    date: '2026-08-07',
    description: 'Reparacion del camion',
    amount: 321.5,
    category: 'vehiculo',
    notes: 'Factura archivada',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function fixedExpenseVersionData(overrides = {}) {
  return {
    expenseId: 'fixed-1',
    effectiveFrom: '2026-08',
    name: 'Combustible',
    amount: 1234.5,
    dueDate: 'Mensual',
    category: 'vehiculo',
    isActive: true,
    notes: 'Gasto operativo',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function setVersionedExpense(db, expenseId, effectiveFrom = '2026-08', overrides = {}) {
  const snapshot = {
    name: overrides.name ?? 'Combustible',
    amount: overrides.amount ?? 1234.5,
    dueDate: overrides.dueDate ?? 'Mensual',
    category: overrides.category ?? 'vehiculo',
    isActive: overrides.isActive ?? true,
    notes: overrides.notes ?? 'Gasto operativo',
  };
  const batch = writeBatch(db);
  batch.set(doc(db, `users/alice/expenses/${expenseId}`), expenseData({
    ...snapshot,
    historyVersion: 1,
    latestEffectiveFrom: effectiveFrom,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
  }));
  batch.set(doc(db, `users/alice/fixedExpenseVersions/${expenseId}__${effectiveFrom}`), fixedExpenseVersionData({
    ...snapshot,
    expenseId,
    effectiveFrom,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
  }));
  await batch.commit();
}

function pricesData(overrides = {}) {
  return {
    ...marginSnapshot(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test('un usuario autenticado puede leer y escribir ventas validas sin borrar su historial', async () => {
  const alice = dbFor('alice');
  const aliceSale = doc(alice, 'users/alice/sales/2026-08');

  await assertSucceeds(setDoc(aliceSale, salesData()));
  await assertSucceeds(getDoc(aliceSale));
  await assertSucceeds(getDocs(collection(alice, 'users/alice/sales')));
  await assertFails(deleteDoc(aliceSale));
});

test('el custom claim appAccess es obligatorio incluso para datos del propio UID', async () => {
  await seed('users/alice/sales/2026-08', {
    ...salesData(),
    updatedAt: new Date('2026-08-07T12:00:00Z'),
  });

  const allowed = dbFor('alice', { appAccess: true });
  const missingClaim = dbFor('alice', {});
  const explicitlyDenied = dbFor('alice', { appAccess: false });

  await assertSucceeds(getDoc(doc(allowed, 'users/alice/sales/2026-08')));
  await assertFails(getDoc(doc(missingClaim, 'users/alice/sales/2026-08')));
  await assertFails(getDocs(collection(missingClaim, 'users/alice/sales')));
  await assertFails(setDoc(doc(missingClaim, 'users/alice/sales/2026-09'), salesData({ month: 9 })));
  await assertFails(deleteDoc(doc(explicitlyDenied, 'users/alice/sales/2026-08')));
});

test('usuarios anonimos y otros UID no pueden leer, listar, escribir ni borrar datos ajenos', async () => {
  await seed('users/alice/sales/2026-08', {
    ...salesData(),
    updatedAt: new Date('2026-08-07T12:00:00Z'),
  });

  const anonymous = unauthenticatedDb();
  const bob = dbFor('bob');

  await assertFails(getDoc(doc(anonymous, 'users/alice/sales/2026-08')));
  await assertFails(setDoc(doc(anonymous, 'users/alice/sales/2026-09'), salesData({ month: 9 })));
  await assertFails(getDoc(doc(bob, 'users/alice/sales/2026-08')));
  await assertFails(getDocs(collection(bob, 'users/alice/sales')));
  await assertFails(setDoc(doc(bob, 'users/alice/sales/2026-09'), salesData({ month: 9 })));
  await assertFails(deleteDoc(doc(bob, 'users/alice/sales/2026-08')));
});

test('ventas exige periodo consistente, enteros no negativos, snapshot estricto y timestamp de servidor', async () => {
  const db = dbFor('alice');

  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-07'), salesData()));
  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08'), salesData({ sifones: -1 })));
  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08'), salesData({ litros6: 1.5 })));

  const withoutSnapshot = salesData();
  delete withoutSnapshot.marginSnapshot;
  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08'), withoutSnapshot));

  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08'), salesData({
    marginSnapshot: { ...marginSnapshot(), injected: true },
  })));
  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08'), salesData({
    updatedAt: new Date('2026-08-07T12:00:00Z'),
  })));
  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08'), salesData({ role: 'admin' })));
});

test('ventas legacy sin snapshot siguen siendo legibles y se actualizan al esquema seguro', async () => {
  const path = 'users/alice/sales/2026-08';
  const legacy = salesData();
  delete legacy.marginSnapshot;
  legacy.updatedAt = new Date('2025-01-01T00:00:00Z');
  await seed(path, legacy);

  const ref = doc(dbFor('alice'), path);
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, salesData(), { merge: true }));

  const migrated = (await getDoc(ref)).data();
  assert.deepEqual(migrated.marginSnapshot, marginSnapshot());
});

test('el snapshot de margen queda inmutable despues de la primera escritura', async () => {
  const ref = doc(dbFor('alice'), 'users/alice/sales/2026-08');
  await assertSucceeds(setDoc(ref, salesData()));

  await assertSucceeds(updateDoc(ref, {
    sifones: 99,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(ref, {
    marginSnapshot: { ...marginSnapshot(), sifones: 999 },
    updatedAt: serverTimestamp(),
  }));
});

test('gastos fijos valida campos, rangos y conserva createdAt al actualizar', async () => {
  const db = dbFor('alice');
  const ref = doc(db, 'users/alice/expenses/fixed-1');

  await assertSucceeds(setVersionedExpense(db, 'fixed-1'));
  await assertSucceeds(setVersionedExpense(db, 'restored', '2026-08', {
    createdAt: new Date('2024-01-01T00:00:00Z'),
  }));
  const created = (await getDoc(ref)).data().createdAt;
  await assertFails(updateDoc(ref, {
    amount: 1300,
    createdAt: created,
    updatedAt: serverTimestamp(),
  }));
  const updateBatch = writeBatch(db);
  updateBatch.update(ref, { amount: 1300, createdAt: created, updatedAt: serverTimestamp() });
  updateBatch.update(doc(db, 'users/alice/fixedExpenseVersions/fixed-1__2026-08'), {
    amount: 1300,
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(updateBatch.commit());

  await assertFails(setDoc(doc(db, 'users/alice/expenses/negative'), expenseData({ amount: -1 })));
  await assertFails(setDoc(doc(db, 'users/alice/expenses/category'), expenseData({ category: 'admin' })));
  await assertFails(setDoc(doc(db, 'users/alice/expenses/blank'), expenseData({ name: '   ' })));
  await assertFails(setDoc(doc(db, 'users/alice/expenses/long-name'), expenseData({ name: 'x'.repeat(121) })));
  await assertFails(setDoc(doc(db, 'users/alice/expenses/long-due-date'), expenseData({ dueDate: 'x'.repeat(81) })));
  await assertFails(setDoc(doc(db, 'users/alice/expenses/long-notes'), expenseData({ notes: 'x'.repeat(1001) })));
  await assertFails(setDoc(doc(db, 'users/alice/expenses/extra'), expenseData({ owner: 'bob' })));
  await assertFails(setDoc(
    doc(db, 'users/alice/expenses/future'),
    expenseData({ createdAt: new Date('2100-01-01T00:00:00Z') }),
  ));
  await assertFails(updateDoc(ref, {
    createdAt: new Date('2020-01-01T00:00:00Z'),
    updatedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(ref));
});

test('las versiones de gastos fijos exigen ID consistente, son privadas y no permiten reescribir historia', async () => {
  const alice = dbFor('alice');
  const bob = dbFor('bob');
  const currentRef = doc(alice, 'users/alice/fixedExpenseVersions/fixed-1__2026-08');

  await seed('users/alice/expenses/fixed-1', {
    ...expenseData({ historyVersion: 1, latestEffectiveFrom: '2026-08' }),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  });
  await assertSucceeds(setDoc(currentRef, fixedExpenseVersionData()));
  await assertSucceeds(getDoc(currentRef));
  await assertSucceeds(getDocs(collection(alice, 'users/alice/fixedExpenseVersions')));
  await assertFails(updateDoc(currentRef, { amount: 2222, updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(bob, 'users/alice/fixedExpenseVersions/fixed-1__2026-08')));
  await assertFails(setDoc(
    doc(alice, 'users/alice/fixedExpenseVersions/wrong-id'),
    fixedExpenseVersionData(),
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/fixedExpenseVersions/fixed-1__2026-13'),
    fixedExpenseVersionData({ effectiveFrom: '2026-13' }),
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/fixedExpenseVersions/fixed-1__2026-09'),
    fixedExpenseVersionData({ effectiveFrom: '2026-09', unexpected: true }),
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/fixedExpenseVersions/fixed-1__2026-09'),
    fixedExpenseVersionData({ effectiveFrom: '2026-09' }),
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/fixedExpenseVersions/orphan__2025-01'),
    fixedExpenseVersionData({ expenseId: 'orphan', effectiveFrom: '2025-01' }),
  ));

  const historicalRef = doc(alice, 'users/alice/fixedExpenseVersions/fixed-1__2025-01');
  await assertSucceeds(setDoc(historicalRef, fixedExpenseVersionData({ effectiveFrom: '2025-01' })));
  await assertFails(updateDoc(historicalRef, {
    amount: 9999,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(historicalRef, { updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(historicalRef));
});

test('restaurar padre y versiones historicas en el mismo lote conserva el acoplamiento', async () => {
  const db = dbFor('alice');
  const batch = writeBatch(db);
  const expenseId = 'restored-with-history';

  batch.set(doc(db, `users/alice/expenses/${expenseId}`), expenseData({
    historyVersion: 1,
    latestEffectiveFrom: '2026-08',
  }));
  batch.set(
    doc(db, `users/alice/fixedExpenseVersions/${expenseId}__2000-01`),
    fixedExpenseVersionData({
      expenseId,
      effectiveFrom: '2000-01',
      amount: 1000,
    }),
  );
  batch.set(
    doc(db, `users/alice/fixedExpenseVersions/${expenseId}__2026-08`),
    fixedExpenseVersionData({ expenseId, effectiveFrom: '2026-08' }),
  );

  await assertSucceeds(batch.commit());
});

test('un gasto fijo migrado exige ambos metadatos y no permite retroceder el último mes', async () => {
  const db = dbFor('alice');
  const ref = doc(db, 'users/alice/expenses/fixed-1');

  await assertSucceeds(setVersionedExpense(db, 'fixed-1'));
  await assertFails(setDoc(
    doc(db, 'users/alice/expenses/incomplete'),
    expenseData({ historyVersion: 1 }),
  ));
  const createdAt = (await getDoc(ref)).data().createdAt;
  await assertFails(updateDoc(ref, {
    latestEffectiveFrom: '2026-07',
    createdAt,
    updatedAt: serverTimestamp(),
  }));
});

test('gastos variables valida fecha, texto, monto, categoria y campos permitidos', async () => {
  const db = dbFor('alice');

  await assertSucceeds(setDoc(
    doc(db, 'users/alice/variableExpenses/variable-1'),
    variableExpenseData(),
  ));
  await assertFails(setDoc(
    doc(db, 'users/alice/variableExpenses/bad-date'),
    variableExpenseData({ date: '07/08/2026' }),
  ));
  await assertFails(setDoc(
    doc(db, 'users/alice/variableExpenses/bad-amount'),
    variableExpenseData({ amount: 0 }),
  ));
  await assertFails(setDoc(
    doc(db, 'users/alice/variableExpenses/bad-description'),
    variableExpenseData({ description: ' '.repeat(10) }),
  ));
  await assertFails(setDoc(
    doc(db, 'users/alice/variableExpenses/long-description'),
    variableExpenseData({ description: 'x'.repeat(201) }),
  ));
  await assertFails(setDoc(
    doc(db, 'users/alice/variableExpenses/long-notes'),
    variableExpenseData({ notes: 'x'.repeat(1001) }),
  ));
  await assertFails(setDoc(
    doc(db, 'users/alice/variableExpenses/extra'),
    variableExpenseData({ unexpected: true }),
  ));
});

test('configuracion de precios acepta solo documentos prices-YYYY con esquema estricto', async () => {
  const db = dbFor('alice');

  await assertSucceeds(setDoc(doc(db, 'users/alice/config/prices-2026'), pricesData()));
  await assertSucceeds(getDoc(doc(db, 'users/alice/config/prices-2026')));
  const configSnapshot = await assertSucceeds(getDocs(collection(db, 'users/alice/config')));
  assert.equal(configSnapshot.size, 1);
  await assertFails(setDoc(doc(db, 'users/alice/config/preferences'), pricesData()));
  await assertSucceeds(getDoc(doc(db, 'users/alice/config/preferences')));
  await assertFails(setDoc(doc(db, 'users/alice/config/prices-2026'), pricesData({ litros12: -1 })));
  await assertFails(setDoc(doc(db, 'users/alice/config/prices-2026'), pricesData({ currency: 'UYU' })));
});

test('historial permite restaurar la misma entrada pero no reescribirla ni borrarla', async () => {
  const db = dbFor('alice');
  const ref = doc(db, 'users/alice/priceHistory/history-1');

  const history = {
    year: 2026,
    ...marginSnapshot(),
    changedAt: new Date('2025-01-01T00:00:00Z'),
  };

  await assertSucceeds(setDoc(ref, history));
  await assertSucceeds(setDoc(ref, history));
  await assertFails(updateDoc(ref, { sifones: 22 }));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db, 'users/alice/priceHistory/history-2'), {
    year: 1999,
    ...marginSnapshot(),
    changedAt: serverTimestamp(),
  }));
});

test('la restauracion completa crea el historial fijo atomicamente y se puede reintentar', async () => {
  const db = dbFor('alice');
  const { expense, version } = fixedRestoreRecords();
  const backup = restoreBackup({ expenses: [expense], versions: [version] });

  const first = await restoreFullBackupToFirestore(db, 'alice', backup);
  assert.equal(first.writtenDocuments, 2);
  assert.equal(first.skippedDocuments, 0);
  await assertSucceeds(getDoc(doc(db, 'users/alice/expenses/fixed-restore')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/fixedExpenseVersions/fixed-restore__2026-08')));

  const retry = await restoreFullBackupToFirestore(db, 'alice', backup);
  assert.equal(retry.writtenDocuments, 0);
  assert.equal(retry.skippedDocuments, 2);
});

test('la restauracion v1 agrega el baseline sin retroceder un gasto fijo ya migrado', async () => {
  const db = dbFor('alice');
  const expenseId = 'legacy-restore';
  await setVersionedExpense(db, expenseId);

  const result = await restoreFullBackupToFirestore(
    db,
    'alice',
    legacyFixedRestoreBackup(expenseId),
  );

  assert.equal(result.writtenDocuments, 1);
  assert.equal(result.skippedDocuments, 1);
  const parent = (await getDoc(doc(db, `users/alice/expenses/${expenseId}`))).data();
  const baseline = (await getDoc(
    doc(db, `users/alice/fixedExpenseVersions/${expenseId}__2000-01`),
  )).data();
  assert.equal(parent.latestEffectiveFrom, '2026-08');
  assert.equal(parent.amount, 1234.5);
  assert.equal(baseline.amount, 900);
});

test('la restauracion conserva createdAt al combinar un documento mutable existente', async () => {
  const originalCreatedAt = new Date('2024-04-05T06:07:08.000Z');
  await seed('users/alice/variableExpenses/variable-restore', {
    ...variableExpenseData({ amount: 100 }),
    createdAt: originalCreatedAt,
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  });
  const variableExpense = {
    id: 'variable-restore',
    data: {
      date: '2026-08-07',
      description: 'Reparacion restaurada',
      amount: 999,
      category: 'vehiculo',
      notes: 'Desde el respaldo',
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
    timestampPaths: ['/createdAt', '/updatedAt'],
  };
  const db = dbFor('alice');

  const result = await restoreFullBackupToFirestore(
    db,
    'alice',
    restoreBackup({ variableExpenses: [variableExpense] }),
  );

  assert.equal(result.writtenDocuments, 1);
  const restored = (await getDoc(
    doc(db, 'users/alice/variableExpenses/variable-restore'),
  )).data();
  assert.equal(restored.amount, 999);
  assert.equal(restored.createdAt.toDate().toISOString(), originalCreatedAt.toISOString());
});

test('la restauracion detecta un margen historico incompatible antes de escribir gastos', async () => {
  await seed('users/alice/sales/2026-08', {
    ...salesData(),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  });
  const { expense, version } = fixedRestoreRecords();
  const sale = {
    id: '2026-08',
    data: {
      year: 2026,
      month: 8,
      sifones: 10,
      litros6: 20,
      litros12: 30,
      litros20: 40,
      marginSnapshot: { ...marginSnapshot(), sifones: 999 },
      updatedAt: backupTimestamp,
    },
    timestampPaths: ['/updatedAt'],
  };
  const db = dbFor('alice');

  await assert.rejects(
    restoreFullBackupToFirestore(
      db,
      'alice',
      restoreBackup({ sales: [sale], expenses: [expense], versions: [version] }),
    ),
    (error) => error instanceof BackupValidationError && /margen historico/.test(error.message),
  );
  assert.equal((await getDoc(doc(db, 'users/alice/expenses/fixed-restore'))).exists(), false);
});

test('la restauracion detecta un priceHistory inmutable incompatible antes de escribir', async () => {
  await seed('users/alice/priceHistory/history-restore', {
    year: 2026,
    ...marginSnapshot(),
    changedAt: new Date('2025-01-01T00:00:00Z'),
  });
  const { expense, version } = fixedRestoreRecords();
  const history = {
    id: 'history-restore',
    data: {
      year: 2026,
      ...marginSnapshot(),
      sifones: 999,
      changedAt: backupTimestamp,
    },
    timestampPaths: ['/changedAt'],
  };
  const db = dbFor('alice');

  await assert.rejects(
    restoreFullBackupToFirestore(
      db,
      'alice',
      restoreBackup({ expenses: [expense], versions: [version], priceHistory: [history] }),
    ),
    (error) => error instanceof BackupValidationError && /historial de precios/.test(error.message),
  );
  assert.equal((await getDoc(doc(db, 'users/alice/expenses/fixed-restore'))).exists(), false);
});

test('metas admite targetMargin y targetIncome legacy, pero no campos ni valores invalidos', async () => {
  const db = dbFor('alice');

  await assertSucceeds(setDoc(doc(db, 'users/alice/goals/2026-08'), {
    year: 2026,
    month: 8,
    targetMargin: 50000,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(db, 'users/alice/goals/2026-09'), {
    year: 2026,
    month: 9,
    targetIncome: 60000,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'users/alice/goals/2026-10'), {
    year: 2026,
    month: 10,
    targetMargin: -1,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'users/alice/goals/2026-11'), {
    year: 2026,
    month: 11,
    targetMargin: 50000,
    isAdmin: true,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'users/alice/goals/2026-12'), {
    year: 2026,
    month: 12,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'users/alice/goals/2026-07'), {
    year: 2026,
    month: 7,
    targetSifones: 1.5,
    updatedAt: serverTimestamp(),
  }));
});

test('documentos padre, colecciones desconocidas y rutas anidadas quedan denegados', async () => {
  const db = dbFor('alice');

  await assertFails(setDoc(doc(db, 'users/alice'), { role: 'admin' }));
  await assertFails(setDoc(doc(db, 'users/alice/secrets/private'), { value: 'x' }));
  await assertFails(setDoc(doc(db, 'users/alice/sales/2026-08/private/nested'), { value: 'x' }));
  await assertFails(getDoc(doc(db, 'users/alice/secrets/private')));
});

test('la prueba realmente lee las reglas cerradas configuradas', () => {
  assert.match(RULES, /allow read, write: if false/);
});
