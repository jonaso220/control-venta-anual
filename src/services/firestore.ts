import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { SalesEntry, Expense, PriceConfig } from '../types';
import { DEFAULT_PRICES, DEFAULT_EXPENSES } from '../types';

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

export async function saveSalesEntry(uid: string, entry: SalesEntry): Promise<void> {
  const docId = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
  await setDoc(doc(userCollection(uid, 'sales'), docId), {
    ...entry,
    updatedAt: serverTimestamp(),
  }, { merge: true });
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
  return DEFAULT_PRICES;
}

export async function savePrices(uid: string, prices: PriceConfig, year: number): Promise<void> {
  const d = getDb();
  const docRef = doc(d, 'users', uid, 'config', `prices-${year}`);
  await setDoc(docRef, {
    ...prices,
    updatedAt: serverTimestamp(),
  });
}

// Initialize default expenses for new users
export async function initializeDefaults(uid: string): Promise<void> {
  const existing = await getExpenses(uid);
  if (existing.length === 0) {
    for (const expense of DEFAULT_EXPENSES) {
      await saveExpense(uid, expense);
    }
  }
}
