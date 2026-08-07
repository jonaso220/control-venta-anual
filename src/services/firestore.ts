import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  runTransaction,
  where,
  orderBy,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { SalesEntry, Expense, PriceConfig, VariableExpense, SalesGoal } from '../types';
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
  const q = query(
    userCollection(uid, 'sales'),
    where('year', '==', year),
    orderBy('month', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SalesEntry));
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
export async function getExpenses(uid: string): Promise<Expense[]> {
  const snapshot = await getDocs(userCollection(uid, 'expenses'));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function saveExpense(uid: string, expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> {
  if (id) {
    await updateDoc(doc(userCollection(uid, 'expenses'), id), {
      ...expense,
      updatedAt: serverTimestamp(),
    });
    return id;
  } else {
    const docRef = doc(userCollection(uid, 'expenses'));
    await setDoc(docRef, {
      ...expense,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }
}

export async function deleteExpense(uid: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(userCollection(uid, 'expenses'), expenseId));
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

export async function saveVariableExpense(uid: string, expense: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> {
  if (id) {
    await updateDoc(doc(userCollection(uid, 'variableExpenses'), id), {
      ...expense,
      updatedAt: serverTimestamp(),
    });
    return id;
  } else {
    const docRef = doc(userCollection(uid, 'variableExpenses'));
    await setDoc(docRef, {
      ...expense,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }
}

export async function deleteVariableExpense(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(userCollection(uid, 'variableExpenses'), id));
}

// Price History
export async function getPriceHistory(uid: string, year: number): Promise<Array<PriceConfig & { changedAt: Date }>> {
  const q = query(
    userCollection(uid, 'priceHistory'),
    where('year', '==', year),
    orderBy('changedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as PriceConfig & { changedAt: Date });
}

// Sales Goals
export async function getGoals(uid: string, year: number): Promise<SalesGoal[]> {
  const q = query(
    userCollection(uid, 'goals'),
    where('year', '==', year),
    orderBy('month', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SalesGoal));
}

export async function saveGoal(uid: string, goal: Omit<SalesGoal, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const docId = `${goal.year}-${String(goal.month).padStart(2, '0')}`;
  await setDoc(doc(userCollection(uid, 'goals'), docId), {
    ...goal,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
