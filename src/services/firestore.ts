import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  runTransaction,
  where,
  orderBy,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  SalesEntry,
  Expense,
  ExpenseSnapshot,
  FixedExpenseVersion,
  PriceConfig,
  VariableExpense,
  SalesGoal,
} from '../types';
import { EMPTY_MARGINS } from '../types';
import {
  copyProductAmounts,
  freezeSalesMargins,
  hasConfiguredMargins,
  isValidProductAmounts,
} from '../domain/finance';

function getDb(): Firestore {
  if (!db) throw new Error('Firebase no esta configurado. Agrega las variables de entorno.');
  return db;
}

function userCollection(uid: string, name: string) {
  return collection(getDb(), 'users', uid, name);
}

// Sales
export async function getSalesForYear(uid: string, year: number): Promise<SalesEntry[]> {
  const q = query(userCollection(uid, 'sales'), where('year', '==', year));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as SalesEntry))
    .toSorted((a, b) => a.month - b.month);
}

export async function saveSalesEntry(uid: string, entry: SalesEntry): Promise<SalesEntry> {
  const d = getDb();
  const docId = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
  const salesRef = doc(d, 'users', uid, 'sales', docId);
  const pricesRef = doc(d, 'users', uid, 'config', `prices-${entry.year}`);

  return runTransaction(d, async transaction => {
    const existingSnapshot = await transaction.get(salesRef);
    const existing = existingSnapshot.exists()
      ? ({ id: existingSnapshot.id, ...existingSnapshot.data() } as SalesEntry)
      : undefined;

    let fallbackMargins: PriceConfig | null = null;
    if (!isValidProductAmounts(existing?.marginSnapshot)) {
      const pricesSnapshot = await transaction.get(pricesRef);
      if (pricesSnapshot.exists() && hasConfiguredMargins(pricesSnapshot.data())) {
        fallbackMargins = pricesSnapshot.data() as PriceConfig;
      }
    }

    if (!isValidProductAmounts(existing?.marginSnapshot) && !fallbackMargins) {
      throw new Error('Configura y guarda los márgenes de este año antes de registrar ventas.');
    }

    const normalized = freezeSalesMargins({
      ...entry,
      id: docId,
      // El snapshot ya guardado es inmutable aunque se editen las cantidades.
      marginSnapshot: isValidProductAmounts(existing?.marginSnapshot)
        ? existing.marginSnapshot
        : undefined,
    }, fallbackMargins ?? EMPTY_MARGINS);

    transaction.set(salesRef, {
      year: normalized.year,
      month: normalized.month,
      sifones: normalized.sifones,
      litros6: normalized.litros6,
      litros12: normalized.litros12,
      litros20: normalized.litros20,
      marginSnapshot: normalized.marginSnapshot,
      ...(!existingSnapshot.exists() ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return normalized;
  });
}

// Expenses
function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = String((error as { code: unknown }).code);
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

const FIXED_EXPENSE_SNAPSHOT_FIELDS = [
  'name',
  'amount',
  'dueDate',
  'category',
  'isActive',
  'notes',
] as const;

function sameFixedExpenseSnapshot(
  expense: ExpenseSnapshot,
  version: FixedExpenseVersion,
): boolean {
  return FIXED_EXPENSE_SNAPSHOT_FIELDS.every(field => expense[field] === version[field]);
}

export function canUseLegacyExpenseFallback(expenses: readonly Expense[]): boolean {
  return expenses.every(expense => expense.historyVersion !== 1);
}

export function isExpenseHistorySnapshotConsistent(
  expenses: readonly Expense[],
  versionsByExpense: ReadonlyMap<string, readonly FixedExpenseVersion[]>,
): boolean {
  const expenseIds = new Set(expenses.flatMap(expense => expense.id ? [expense.id] : []));
  if ([...versionsByExpense.keys()].some(expenseId => !expenseIds.has(expenseId))) return false;

  return expenses.every(expense => {
    if (!expense.id) return false;
    const versions = versionsByExpense.get(expense.id) ?? [];
    if (expense.historyVersion !== 1) return versions.length === 0;
    if (!expense.latestEffectiveFrom || versions.length === 0) return false;

    const latestVersion = versions.toSorted((a, b) => (
      a.effectiveFrom.localeCompare(b.effectiveFrom)
    )).at(-1);

    return latestVersion?.effectiveFrom === expense.latestEffectiveFrom
      && sameFixedExpenseSnapshot(expense, latestVersion);
  });
}

async function loadExpenses(uid: string, retryOnMixedSnapshot: boolean): Promise<Expense[]> {
  const expensesPromise = getDocs(userCollection(uid, 'expenses'));
  const versionsPromise = getDocs(userCollection(uid, 'fixedExpenseVersions'))
    .then(snapshot => ({ snapshot, available: true as const }))
    .catch(error => {
      // Compatibility for the short rollout window in which the new client is
      // already live but the previous rules still deny the new collection.
      if (isPermissionDenied(error)) return { snapshot: null, available: false as const };
      throw error;
    });
  const [expensesSnapshot, versionsResult] = await Promise.all([
    expensesPromise,
    versionsPromise,
  ]);
  const versionsByExpense = new Map<string, FixedExpenseVersion[]>();

  versionsResult.snapshot?.docs.forEach(versionDoc => {
    const version = { id: versionDoc.id, ...versionDoc.data() } as FixedExpenseVersion;
    const versions = versionsByExpense.get(version.expenseId) ?? [];
    versions.push(version);
    versionsByExpense.set(version.expenseId, versions);
  });

  const expenses = expensesSnapshot.docs.map(expenseDoc => {
    const expense = { id: expenseDoc.id, ...expenseDoc.data() } as Expense;
    const versions = versionsByExpense.get(expenseDoc.id);
    return {
      ...expense,
      ...(versions ? { versions: versions.toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)) } : {}),
    };
  });

  if (!versionsResult.available) {
    if (canUseLegacyExpenseFallback(expenses)) return expenses;
    throw new Error(
      'No se pudo verificar el historial de gastos fijos migrados. Reintenta cuando las reglas estén actualizadas.',
    );
  }

  if (!isExpenseHistorySnapshotConsistent(expenses, versionsByExpense)) {
    if (retryOnMixedSnapshot) return loadExpenses(uid, false);
    throw new Error('No se pudo leer un historial de gastos fijos consistente. Reintenta.');
  }

  return expenses;
}

export async function getExpenses(uid: string): Promise<Expense[]> {
  return loadExpenses(uid, true);
}

const LEGACY_EXPENSE_EFFECTIVE_FROM = '2000-01';

export interface SavedExpenseResult {
  expense: Expense;
  writtenVersions: FixedExpenseVersion[];
}

function assertValidYearMonth(value: string): void {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('El mes efectivo del gasto no es válido.');
  }
}

function expenseSnapshot(expense: ExpenseSnapshot): ExpenseSnapshot {
  return {
    name: expense.name,
    amount: expense.amount,
    dueDate: expense.dueDate,
    category: expense.category,
    isActive: expense.isActive,
    ...(expense.notes !== undefined ? { notes: expense.notes } : {}),
  };
}

function versionData(
  expenseId: string,
  effectiveFrom: string,
  expense: ExpenseSnapshot,
): Omit<FixedExpenseVersion, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    expenseId,
    effectiveFrom,
    ...expenseSnapshot(expense),
  };
}

async function persistExpense(
  uid: string,
  expenseId: string,
  effectiveFrom: string,
  resolveExpense: (existing: Expense | undefined) => ExpenseSnapshot,
): Promise<SavedExpenseResult> {
  assertValidYearMonth(effectiveFrom);
  if (!expenseId) throw new Error('El gasto necesita un identificador estable.');

  const d = getDb();
  const expenseRef = doc(d, 'users', uid, 'expenses', expenseId);
  const versionRef = doc(d, 'users', uid, 'fixedExpenseVersions', `${expenseId}__${effectiveFrom}`);
  const baselineRef = doc(
    d,
    'users',
    uid,
    'fixedExpenseVersions',
    `${expenseId}__${LEGACY_EXPENSE_EFFECTIVE_FROM}`,
  );

  return runTransaction(d, async transaction => {
    const existingSnapshot = await transaction.get(expenseRef);
    const existing = existingSnapshot.exists()
      ? ({ id: existingSnapshot.id, ...existingSnapshot.data() } as Expense)
      : undefined;
    const nextExpense = expenseSnapshot(resolveExpense(existing));

    if (
      existing?.historyVersion === 1 &&
      existing.latestEffectiveFrom &&
      effectiveFrom < existing.latestEffectiveFrom
    ) {
      throw new Error('No se puede guardar una versión anterior a la última registrada.');
    }

    // Firestore exige completar todas las lecturas antes de empezar a escribir.
    const currentVersionSnapshot = await transaction.get(versionRef);
    const needsLegacyBaseline = Boolean(existing && existing.historyVersion !== 1);
    const baselineSnapshot = needsLegacyBaseline && baselineRef.path !== versionRef.path
      ? await transaction.get(baselineRef)
      : null;

    const writtenVersions: FixedExpenseVersion[] = [];
    if (existing && needsLegacyBaseline && baselineSnapshot && !baselineSnapshot.exists()) {
      const baseline = versionData(expenseId, LEGACY_EXPENSE_EFFECTIVE_FROM, existing);
      transaction.set(baselineRef, {
        ...baseline,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writtenVersions.push({ id: baselineRef.id, ...baseline });
    }

    const currentVersion = versionData(expenseId, effectiveFrom, nextExpense);
    transaction.set(versionRef, {
      ...currentVersion,
      ...(!currentVersionSnapshot.exists() ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    transaction.set(expenseRef, {
      ...nextExpense,
      historyVersion: 1,
      latestEffectiveFrom: effectiveFrom,
      ...(!existingSnapshot.exists() ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    writtenVersions.push({ id: versionRef.id, ...currentVersion });

    return {
      expense: {
        id: expenseId,
        ...nextExpense,
        historyVersion: 1,
        latestEffectiveFrom: effectiveFrom,
      },
      writtenVersions,
    };
  });
}

export async function saveExpense(
  uid: string,
  expense: ExpenseSnapshot,
  id: string,
  effectiveFrom: string,
): Promise<SavedExpenseResult> {
  return persistExpense(uid, id, effectiveFrom, () => expense);
}

/** Conserva los meses anteriores y registra una versión inactiva desde ahora. */
export async function deleteExpense(
  uid: string,
  expenseId: string,
  effectiveFrom: string,
): Promise<SavedExpenseResult> {
  return persistExpense(uid, expenseId, effectiveFrom, existing => {
    if (!existing) throw new Error('El gasto que intentas desactivar ya no existe.');
    return { ...expenseSnapshot(existing), isActive: false };
  });
}

// Prices (per year)
export async function getPrices(uid: string, year: number): Promise<PriceConfig> {
  const d = getDb();
  const docRef = doc(d, 'users', uid, 'config', `prices-${year}`);
  const snapshot = await getDoc(docRef);
  if (snapshot.exists()) {
    return snapshot.data() as PriceConfig;
  }
  return EMPTY_MARGINS;
}

export async function savePrices(uid: string, prices: PriceConfig, year: number): Promise<SalesEntry[]> {
  if (!isValidProductAmounts(prices)) {
    throw new Error('Los márgenes deben ser números finitos mayores o iguales a cero.');
  }

  const d = getDb();
  const pricesRef = doc(d, 'users', uid, 'config', `prices-${year}`);
  const historyRef = doc(collection(d, 'users', uid, 'priceHistory'));
  const salesRefs = Array.from({ length: 12 }, (_, monthIndex) => {
    const docId = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return doc(d, 'users', uid, 'sales', docId);
  });

  return runTransaction(d, async transaction => {
    const currentPricesSnapshot = await transaction.get(pricesRef);
    const hasCurrentMargins = currentPricesSnapshot.exists() && hasConfiguredMargins(currentPricesSnapshot.data());
    const currentMargins = hasCurrentMargins
      ? currentPricesSnapshot.data() as PriceConfig
      : prices;

    // Todas las lecturas ocurren antes de escribir para que Firestore pueda
    // reintentar si otra pestaña cambia ventas o margenes al mismo tiempo.
    const salesSnapshots = [];
    for (const salesRef of salesRefs) {
      salesSnapshots.push(await transaction.get(salesRef));
    }

    const normalizedSales: SalesEntry[] = [];
    salesSnapshots.forEach((snapshot, monthIndex) => {
      if (!snapshot.exists()) return;

      const entry = { id: snapshot.id, ...snapshot.data() } as SalesEntry;
      const normalized = freezeSalesMargins(entry, currentMargins);
      normalizedSales.push(normalized);

      if (!isValidProductAmounts(entry.marginSnapshot)) {
        transaction.set(salesRefs[monthIndex], {
          marginSnapshot: normalized.marginSnapshot,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    });

    transaction.set(pricesRef, {
      ...copyProductAmounts(prices),
      updatedAt: serverTimestamp(),
    });
    if (hasCurrentMargins) {
      transaction.set(historyRef, {
        year,
        ...copyProductAmounts(currentMargins),
        changedAt: serverTimestamp(),
      });
    }

    return normalizedSales;
  });
}

// Variable Expenses
export async function getVariableExpenses(uid: string, year: number): Promise<VariableExpense[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const q = query(
    userCollection(uid, 'variableExpenses'),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as VariableExpense));
}

export async function saveVariableExpense(
  uid: string,
  expense: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'>,
  id: string,
): Promise<VariableExpense> {
  if (!id) throw new Error('El gasto variable necesita un identificador estable.');
  const d = getDb();
  const expenseRef = doc(d, 'users', uid, 'variableExpenses', id);

  return runTransaction(d, async transaction => {
    const existingSnapshot = await transaction.get(expenseRef);
    transaction.set(expenseRef, {
      ...expense,
      ...(!existingSnapshot.exists() ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { id, ...expense };
  });
}

export async function deleteVariableExpense(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(userCollection(uid, 'variableExpenses'), id));
}

// Price History
export async function getPriceHistory(uid: string, year: number): Promise<Array<PriceConfig & { changedAt: Date }>> {
  const q = query(userCollection(uid, 'priceHistory'), where('year', '==', year));
  const snapshot = await getDocs(q);
  const toMillis = (value: unknown): number => {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === 'object' && 'toMillis' in value) {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (value && typeof value === 'object' && 'seconds' in value) {
      return Number((value as { seconds: number }).seconds) * 1000;
    }
    return 0;
  };
  return snapshot.docs
    .map((d) => d.data() as PriceConfig & { changedAt: Date })
    .toSorted((a, b) => toMillis(b.changedAt) - toMillis(a.changedAt));
}

// Sales Goals
export async function getGoals(uid: string, year: number): Promise<SalesGoal[]> {
  const q = query(userCollection(uid, 'goals'), where('year', '==', year));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as SalesGoal))
    .toSorted((a, b) => a.month - b.month);
}

export async function saveGoal(uid: string, goal: Omit<SalesGoal, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const docId = `${goal.year}-${String(goal.month).padStart(2, '0')}`;
  await setDoc(doc(userCollection(uid, 'goals'), docId), {
    ...goal,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
