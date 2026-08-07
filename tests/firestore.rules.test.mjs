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
} from 'firebase/firestore';

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

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
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

test('un usuario autenticado puede leer y escribir solo sus ventas validas', async () => {
  const alice = dbFor('alice');
  const aliceSale = doc(alice, 'users/alice/sales/2026-08');

  await assertSucceeds(setDoc(aliceSale, salesData()));
  await assertSucceeds(getDoc(aliceSale));
  await assertSucceeds(getDocs(collection(alice, 'users/alice/sales')));
  await assertSucceeds(deleteDoc(aliceSale));
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

  await assertSucceeds(setDoc(ref, expenseData()));
  await assertSucceeds(setDoc(
    doc(db, 'users/alice/expenses/restored'),
    expenseData({ createdAt: new Date('2024-01-01T00:00:00Z') }),
  ));
  const created = (await getDoc(ref)).data().createdAt;
  await assertSucceeds(updateDoc(ref, {
    amount: 1300,
    createdAt: created,
    updatedAt: serverTimestamp(),
  }));

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
  await assertFails(setDoc(doc(db, 'users/alice/config/preferences'), pricesData()));
  await assertFails(getDoc(doc(db, 'users/alice/config/preferences')));
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
