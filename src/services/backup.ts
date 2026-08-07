import {
  Timestamp,
  collection,
  doc,
  getDocsFromServer,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';

export const BACKUP_SCHEMA_VERSION = 2 as const;
export const BACKUP_APP_ID = 'control-venta-anual' as const;
const LEGACY_BACKUP_SCHEMA_VERSION = 1 as const;

const MAX_BACKUP_FILE_MEGABYTES = 100;
const MAX_BACKUP_FILE_BYTES = MAX_BACKUP_FILE_MEGABYTES * 1024 * 1024;
const MAX_BACKUP_DOCUMENTS = 50_000;
const MAX_VALUE_DEPTH = 20;
const RESTORE_BATCH_SIZE = 400;
const COLLECTIONS_WITH_UPDATED_AT = new Set<BackupCollectionName>([
  'sales',
  'expenses',
  'fixedExpenseVersions',
  'variableExpenses',
  'config',
  'goals',
]);

const LEGACY_BACKUP_COLLECTIONS = [
  'sales',
  'expenses',
  'variableExpenses',
  'config',
  'priceHistory',
  'goals',
] as const;

const BACKUP_COLLECTIONS = [
  'sales',
  'expenses',
  'fixedExpenseVersions',
  'variableExpenses',
  'config',
  'priceHistory',
  'goals',
] as const;

const MARGIN_KEYS = ['sifones', 'litros6', 'litros12', 'litros20'] as const;
const EXPENSE_CATEGORIES = new Set([
  'impuestos',
  'prestamos',
  'seguros',
  'sueldos',
  'vehiculo',
  'otros',
]);

export type BackupCollectionName = (typeof BACKUP_COLLECTIONS)[number];
export type BackupValue = null | boolean | number | string | BackupValue[] | BackupObject;
export type BackupObject = { [key: string]: BackupValue };

export interface BackupRecord {
  id: string;
  data: BackupObject;
  /** JSON Pointer paths whose ISO strings must be restored as Firestore Timestamps. */
  timestampPaths: string[];
}

export type BackupCollectionCounts = Record<BackupCollectionName, number> & { total: number };

export interface FullBackup {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  app: typeof BACKUP_APP_ID;
  exportedAt: string;
  years: number[];
  counts: BackupCollectionCounts;
  collections: Record<BackupCollectionName, BackupRecord[]>;
}

export interface RestoreResult {
  restoredAt: string;
  counts: BackupCollectionCounts;
  writtenDocuments: number;
  skippedDocuments: number;
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export class BackupRestorePartialError extends Error {
  readonly writtenDocuments: number;

  constructor(writtenDocuments: number, cause: unknown) {
    super(
      `La restauracion se interrumpio despues de combinar ${writtenDocuments} documentos. `
      + 'No se borro ningun dato; vuelve a intentar el mismo archivo para completar los lotes pendientes.',
      { cause },
    );
    this.name = 'BackupRestorePartialError';
    this.writtenDocuments = writtenDocuments;
  }
}

function getDb(): Firestore {
  if (!db) {
    throw new Error('Firebase no esta configurado. Agrega las variables de entorno.');
  }
  return db;
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = String((error as { code: unknown }).code);
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function childPath(path: string, key: string | number): string {
  return `${path}/${escapeJsonPointerSegment(String(key))}`;
}

function assertSafeKey(key: string, context: string): void {
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
    throw new BackupValidationError(`${context}: la clave "${key}" no esta permitida.`);
  }
}

function normalizeFirestoreValue(
  value: unknown,
  path: string,
  timestampPaths: string[],
  context: string,
  depth = 0,
): BackupValue {
  if (depth > MAX_VALUE_DEPTH) {
    throw new BackupValidationError(`${context}: la estructura supera ${MAX_VALUE_DEPTH} niveles.`);
  }

  if (value instanceof Timestamp) {
    timestampPaths.push(path);
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new BackupValidationError(`${context}: contiene una fecha invalida en ${path}.`);
    }
    timestampPaths.push(path);
    return value.toISOString();
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BackupValidationError(`${context}: contiene un numero no finito en ${path}.`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeFirestoreValue(
      item,
      childPath(path, index),
      timestampPaths,
      context,
      depth + 1,
    ));
  }

  if (isPlainObject(value)) {
    const normalized: BackupObject = {};
    for (const [key, item] of Object.entries(value)) {
      assertSafeKey(key, context);
      if (item === undefined) {
        throw new BackupValidationError(`${context}: contiene un valor undefined en ${childPath(path, key)}.`);
      }
      normalized[key] = normalizeFirestoreValue(
        item,
        childPath(path, key),
        timestampPaths,
        context,
        depth + 1,
      );
    }
    return normalized;
  }

  throw new BackupValidationError(`${context}: contiene un tipo de dato de Firestore no soportado en ${path}.`);
}

function normalizeDocument(collectionName: BackupCollectionName, id: string, data: DocumentData): BackupRecord {
  const timestampPaths: string[] = [];
  const context = `${collectionName}/${id}`;
  const normalized = normalizeFirestoreValue(data, '', timestampPaths, context);
  if (!isBackupObject(normalized)) {
    throw new BackupValidationError(`${context}: el documento no es un objeto valido.`);
  }
  return { id, data: normalized, timestampPaths: timestampPaths.toSorted() };
}

function isBackupObject(value: BackupValue): value is BackupObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function calculateCounts(collections: FullBackup['collections']): BackupCollectionCounts {
  const counts = {
    sales: collections.sales.length,
    expenses: collections.expenses.length,
    fixedExpenseVersions: collections.fixedExpenseVersions.length,
    variableExpenses: collections.variableExpenses.length,
    config: collections.config.length,
    priceHistory: collections.priceHistory.length,
    goals: collections.goals.length,
    total: 0,
  };
  counts.total = BACKUP_COLLECTIONS.reduce((total, name) => total + counts[name], 0);
  return counts;
}

function deriveYears(collections: FullBackup['collections']): number[] {
  const years = new Set<number>();

  for (const collectionName of ['sales', 'priceHistory', 'goals'] as const) {
    for (const record of collections[collectionName]) {
      const year = record.data.year;
      if (typeof year === 'number' && Number.isInteger(year)) years.add(year);
    }
  }

  for (const record of collections.variableExpenses) {
    const date = record.data.date;
    if (typeof date === 'string' && /^\d{4}-/.test(date)) years.add(Number(date.slice(0, 4)));
  }

  for (const record of collections.fixedExpenseVersions) {
    const effectiveFrom = record.data.effectiveFrom;
    if (
      typeof effectiveFrom === 'string'
      && effectiveFrom !== '2000-01'
      && /^\d{4}-/.test(effectiveFrom)
    ) {
      years.add(Number(effectiveFrom.slice(0, 4)));
    }
  }

  for (const record of collections.config) {
    const match = /^prices-(\d{4})$/.exec(record.id);
    if (match) years.add(Number(match[1]));
  }

  return [...years].toSorted((a, b) => a - b);
}

/** Reads every supported user collection from the Firestore server, never from React's cached state. */
export async function createFullBackup(uid: string): Promise<FullBackup> {
  assertUid(uid, 'UID actual');
  const database = getDb();
  const snapshots = await Promise.all(
    BACKUP_COLLECTIONS.map(async name => {
      try {
        return await getDocsFromServer(collection(database, 'users', uid, name));
      } catch (error) {
        // During the coordinated rollout, the previous rules do not know the
        // new history collection yet. Legacy expenses can still be backed up
        // and are normalized to a baseline version by validateFullBackup().
        if (name === 'fixedExpenseVersions' && isPermissionDenied(error)) return null;
        throw error;
      }
    }),
  );

  const collections = Object.fromEntries(
    snapshots.map((snapshot, index) => {
      const collectionName = BACKUP_COLLECTIONS[index];
      const records = (snapshot?.docs ?? [])
        .map((snapshotDoc) => normalizeDocument(collectionName, snapshotDoc.id, snapshotDoc.data()))
        .toSorted((a, b) => a.id.localeCompare(b.id));
      return [collectionName, records];
    }),
  ) as FullBackup['collections'];

  const backup: FullBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    years: deriveYears(collections),
    counts: calculateCounts(collections),
    collections,
  };

  return validateFullBackup(backup);
}

export async function downloadFullBackup(uid: string): Promise<FullBackup> {
  const backup = await createFullBackup(uid);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  if (blob.size > MAX_BACKUP_FILE_BYTES) {
    throw new BackupValidationError(
      `El respaldo supera el limite de ${MAX_BACKUP_FILE_MEGABYTES} MB y no se puede descargar como un unico archivo.`,
    );
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const timestamp = backup.exportedAt.replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  anchor.href = url;
  anchor.download = `respaldo_completo_${timestamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup;
}

export async function readBackupFile(file: File): Promise<FullBackup> {
  if (file.size === 0) throw new BackupValidationError('El archivo esta vacio.');
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new BackupValidationError(`El archivo supera el limite de ${MAX_BACKUP_FILE_MEGABYTES} MB.`);
  }

  let parsed: unknown;
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new BackupValidationError('El archivo no contiene JSON valido.');
  }
  return validateFullBackup(parsed);
}

export function validateFullBackup(value: unknown): FullBackup {
  const root = assertObject(value, 'Respaldo');
  const rootKeys = ['schemaVersion', 'app', 'exportedAt', 'years', 'counts', 'collections'] as const;
  assertOnlyKeys(root, rootKeys, 'Respaldo');
  assertRequiredKeys(root, rootKeys, 'Respaldo');

  if (
    root.schemaVersion !== BACKUP_SCHEMA_VERSION
    && root.schemaVersion !== LEGACY_BACKUP_SCHEMA_VERSION
  ) {
    throw new BackupValidationError(
      `Version de respaldo no compatible: se esperaba ${LEGACY_BACKUP_SCHEMA_VERSION} o ${BACKUP_SCHEMA_VERSION}.`,
    );
  }
  if (root.app !== BACKUP_APP_ID) {
    throw new BackupValidationError('El archivo no pertenece a Control Venta Anual.');
  }
  assertIsoTimestamp(root.exportedAt, 'Respaldo.exportedAt');

  const sourceCollections = root.schemaVersion === LEGACY_BACKUP_SCHEMA_VERSION
    ? LEGACY_BACKUP_COLLECTIONS
    : BACKUP_COLLECTIONS;
  const rawCollections = assertObject(root.collections, 'Respaldo.collections');
  assertOnlyKeys(rawCollections, [...sourceCollections], 'Respaldo.collections');
  assertRequiredKeys(rawCollections, [...sourceCollections], 'Respaldo.collections');
  const collections = Object.fromEntries(
    BACKUP_COLLECTIONS.map(collectionName => [collectionName, []]),
  ) as unknown as FullBackup['collections'];
  for (const collectionName of sourceCollections) {
    const rawRecords = rawCollections[collectionName];
    if (!Array.isArray(rawRecords)) {
      throw new BackupValidationError(`Respaldo.collections.${collectionName} debe ser una lista.`);
    }

    const ids = new Set<string>();
    collections[collectionName] = rawRecords.map((rawRecord, index) => {
      const context = `${collectionName}[${index}]`;
      const record = validateRecord(rawRecord, collectionName, context);
      if (ids.has(record.id)) {
        throw new BackupValidationError(`${context}: el ID "${record.id}" esta repetido.`);
      }
      ids.add(record.id);
      return record;
    });
  }

  backfillLegacySalesMarginSnapshots(collections);
  const sourceExpectedCounts = calculateCounts(collections);
  validateCounts(root.counts, sourceExpectedCounts, sourceCollections);
  backfillLegacyFixedExpenseVersions(collections);
  validateFixedExpenseHistoryConsistency(collections);

  const expectedCounts = calculateCounts(collections);
  if (expectedCounts.total > MAX_BACKUP_DOCUMENTS) {
    throw new BackupValidationError(`El respaldo supera el limite de ${MAX_BACKUP_DOCUMENTS} documentos.`);
  }

  if (!Array.isArray(root.years)) throw new BackupValidationError('Respaldo.years debe ser una lista.');
  const years = root.years.map((year, index) => {
    assertYear(year, `Respaldo.years[${index}]`);
    return year;
  });
  if (new Set(years).size !== years.length || !years.every((year, index) => index === 0 || years[index - 1] < year)) {
    throw new BackupValidationError('Respaldo.years debe estar ordenado y no contener repetidos.');
  }
  const expectedYears = deriveYears(collections);
  if (years.length !== expectedYears.length || years.some((year, index) => year !== expectedYears[index])) {
    throw new BackupValidationError('Los anos declarados no coinciden con los documentos del respaldo.');
  }

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: root.exportedAt,
    years,
    counts: expectedCounts,
    collections,
  } as FullBackup;
}

function backfillLegacySalesMarginSnapshots(collections: FullBackup['collections']): void {
  const marginsByYear = new Map<number, BackupObject>();
  for (const record of collections.config) {
    const match = /^prices-(\d{4})$/.exec(record.id);
    if (!match) continue;
    marginsByYear.set(Number(match[1]), {
      sifones: record.data.sifones,
      litros6: record.data.litros6,
      litros12: record.data.litros12,
      litros20: record.data.litros20,
    });
  }

  for (const record of collections.sales) {
    if (record.data.marginSnapshot !== undefined) continue;
    const year = record.data.year as number;
    const fallbackMargins = marginsByYear.get(year);
    if (!fallbackMargins) {
      throw new BackupValidationError(
        `La venta legacy sales/${record.id} no tiene marginSnapshot y falta config/prices-${year} para completarla sin alterar sus calculos.`,
      );
    }
    record.data = {
      ...record.data,
      marginSnapshot: { ...fallbackMargins },
    };
  }
}

function backfillLegacyFixedExpenseVersions(collections: FullBackup['collections']): void {
  const versionedExpenseIds = new Set(
    collections.fixedExpenseVersions.map(version => version.data.expenseId as string),
  );

  for (const expense of collections.expenses) {
    if (expense.data.historyVersion !== undefined || versionedExpenseIds.has(expense.id)) continue;
    const effectiveFrom = '2000-01';
    const versionId = `${expense.id}__${effectiveFrom}`;
    assertDocumentId(versionId, `fixedExpenseVersions/${versionId}.id`);
    const versionData: BackupObject = {
      expenseId: expense.id,
      effectiveFrom,
      name: expense.data.name,
      amount: expense.data.amount,
      dueDate: expense.data.dueDate,
      category: expense.data.category,
      isActive: expense.data.isActive,
      ...(expense.data.notes !== undefined ? { notes: expense.data.notes } : {}),
      createdAt: expense.data.createdAt,
      updatedAt: expense.data.updatedAt,
    };
    collections.fixedExpenseVersions.push({
      id: versionId,
      data: versionData,
      timestampPaths: ['/createdAt', '/updatedAt'],
    });
    expense.data = {
      ...expense.data,
      historyVersion: 1,
      latestEffectiveFrom: effectiveFrom,
    };
  }

  collections.fixedExpenseVersions.sort((a, b) => a.id.localeCompare(b.id));
}

function validateFixedExpenseHistoryConsistency(collections: FullBackup['collections']): void {
  const expensesById = new Map(collections.expenses.map(record => [record.id, record]));
  const versionsByExpense = new Map<string, BackupRecord[]>();

  for (const version of collections.fixedExpenseVersions) {
    const expenseId = version.data.expenseId as string;
    const expense = expensesById.get(expenseId);
    if (!expense) {
      throw new BackupValidationError(
        `fixedExpenseVersions/${version.id} referencia el gasto inexistente expenses/${expenseId}.`,
      );
    }
    if (expense.data.historyVersion !== 1) {
      throw new BackupValidationError(
        `expenses/${expenseId} debe declarar historyVersion 1 porque tiene versiones.`,
      );
    }
    const versions = versionsByExpense.get(expenseId) ?? [];
    versions.push(version);
    versionsByExpense.set(expenseId, versions);
  }

  for (const expense of collections.expenses) {
    const versions = versionsByExpense.get(expense.id) ?? [];
    if (expense.data.historyVersion !== 1) {
      if (versions.length > 0) {
        throw new BackupValidationError(`expenses/${expense.id} tiene versiones sin activar su historial.`);
      }
      continue;
    }
    if (versions.length === 0) {
      throw new BackupValidationError(`expenses/${expense.id} declara historial pero no contiene versiones.`);
    }
    const latestVersion = versions
      .toSorted((a, b) => (
        (a.data.effectiveFrom as string).localeCompare(b.data.effectiveFrom as string)
      ))
      .at(-1);
    if (expense.data.latestEffectiveFrom !== latestVersion?.data.effectiveFrom) {
      throw new BackupValidationError(
        `expenses/${expense.id}.latestEffectiveFrom no coincide con su última versión.`,
      );
    }
    const snapshotFields = ['name', 'amount', 'dueDate', 'category', 'isActive', 'notes'] as const;
    if (snapshotFields.some(field => (
      expense.data[field] !== latestVersion?.data[field]
    ))) {
      throw new BackupValidationError(
        `expenses/${expense.id} no coincide con el contenido de su última versión.`,
      );
    }
  }
}

function validateRecord(value: unknown, collectionName: BackupCollectionName, context: string): BackupRecord {
  const record = assertObject(value, context);
  assertOnlyKeys(record, ['id', 'data', 'timestampPaths'], context);
  assertRequiredKeys(record, ['id', 'data', 'timestampPaths'], context);
  assertDocumentId(record.id, `${context}.id`);
  const data = validateBackupObject(record.data, `${context}.data`);

  if (!Array.isArray(record.timestampPaths)) {
    throw new BackupValidationError(`${context}.timestampPaths debe ser una lista.`);
  }
  const timestampPaths = record.timestampPaths.map((path, pathIndex) => {
    if (typeof path !== 'string' || !/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/.test(path)) {
      throw new BackupValidationError(`${context}.timestampPaths[${pathIndex}] no es un JSON Pointer valido.`);
    }
    return path;
  });
  if (new Set(timestampPaths).size !== timestampPaths.length) {
    throw new BackupValidationError(`${context}.timestampPaths contiene rutas repetidas.`);
  }

  validateCollectionData(collectionName, record.id, data, timestampPaths, context);
  for (const path of timestampPaths) {
    const timestamp = valueAtJsonPointer(data, path, context);
    assertIsoTimestamp(timestamp, `${context}.data${path}`);
  }

  return { id: record.id, data, timestampPaths: timestampPaths.toSorted() };
}

function validateBackupObject(value: unknown, context: string, depth = 0): BackupObject {
  const object = assertObject(value, context);
  if (depth > MAX_VALUE_DEPTH) {
    throw new BackupValidationError(`${context}: la estructura supera ${MAX_VALUE_DEPTH} niveles.`);
  }
  const result: BackupObject = {};
  for (const [key, item] of Object.entries(object)) {
    assertSafeKey(key, context);
    result[key] = validateBackupValue(item, `${context}.${key}`, depth + 1);
  }
  return result;
}

function validateBackupValue(value: unknown, context: string, depth: number): BackupValue {
  if (depth > MAX_VALUE_DEPTH) {
    throw new BackupValidationError(`${context}: la estructura supera ${MAX_VALUE_DEPTH} niveles.`);
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > 100_000) throw new BackupValidationError(`${context}: el texto es demasiado largo.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BackupValidationError(`${context}: debe ser un numero finito.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => validateBackupValue(item, `${context}[${index}]`, depth + 1));
  return validateBackupObject(value, context, depth + 1);
}

function validateCollectionData(
  collectionName: BackupCollectionName,
  id: string,
  data: BackupObject,
  timestampPaths: string[],
  context: string,
): void {
  switch (collectionName) {
    case 'sales':
      assertOnlyKeys(data, [
        'year', 'month', 'sifones', 'litros6', 'litros12', 'litros20',
        'marginSnapshot', 'createdAt', 'updatedAt',
      ], `${context}.data`);
      assertYear(data.year, `${context}.data.year`);
      assertMonth(data.month, `${context}.data.month`);
      assertYearMonthDocumentId(id, data.year, data.month, `${context}.id`);
      for (const key of MARGIN_KEYS) {
        assertBoundedInteger(data[key], `${context}.data.${key}`, 0, 1_000_000_000);
      }
      if (data.marginSnapshot !== undefined) validateMarginMap(data.marginSnapshot, `${context}.data.marginSnapshot`);
      validateTimestampFields(data, timestampPaths, ['updatedAt'], ['createdAt'], context);
      break;
    case 'expenses':
      assertOnlyKeys(data, [
        'name', 'amount', 'dueDate', 'category', 'isActive', 'notes',
        'historyVersion', 'latestEffectiveFrom', 'createdAt', 'updatedAt',
      ], `${context}.data`);
      assertRequiredText(data.name, `${context}.data.name`, 120);
      assertBoundedNumber(data.amount, `${context}.data.amount`, Number.MIN_VALUE, 1_000_000_000_000);
      assertShortString(data.dueDate, `${context}.data.dueDate`, 80);
      assertCategory(data.category, `${context}.data.category`);
      if (typeof data.isActive !== 'boolean') throw new BackupValidationError(`${context}.data.isActive debe ser booleano.`);
      if (data.notes !== undefined) assertShortString(data.notes, `${context}.data.notes`, 1_000);
      if (data.historyVersion === undefined && data.latestEffectiveFrom !== undefined) {
        throw new BackupValidationError(`${context}.data.latestEffectiveFrom requiere historyVersion.`);
      }
      if (data.historyVersion !== undefined) {
        if (data.historyVersion !== 1) {
          throw new BackupValidationError(`${context}.data.historyVersion debe ser 1.`);
        }
        assertYearMonth(data.latestEffectiveFrom, `${context}.data.latestEffectiveFrom`);
      }
      validateTimestampFields(data, timestampPaths, ['createdAt', 'updatedAt'], [], context);
      break;
    case 'fixedExpenseVersions':
      assertOnlyKeys(data, [
        'expenseId', 'effectiveFrom', 'name', 'amount', 'dueDate', 'category',
        'isActive', 'notes', 'createdAt', 'updatedAt',
      ], `${context}.data`);
      assertDocumentId(data.expenseId, `${context}.data.expenseId`);
      if (data.expenseId.length > 1_400) {
        throw new BackupValidationError(`${context}.data.expenseId supera 1400 caracteres.`);
      }
      assertYearMonth(data.effectiveFrom, `${context}.data.effectiveFrom`);
      if (id !== `${data.expenseId}__${data.effectiveFrom}`) {
        throw new BackupValidationError(
          `${context}.id debe coincidir con expenseId__effectiveFrom.`,
        );
      }
      assertRequiredText(data.name, `${context}.data.name`, 120);
      assertBoundedNumber(data.amount, `${context}.data.amount`, Number.MIN_VALUE, 1_000_000_000_000);
      assertShortString(data.dueDate, `${context}.data.dueDate`, 80);
      assertCategory(data.category, `${context}.data.category`);
      if (typeof data.isActive !== 'boolean') throw new BackupValidationError(`${context}.data.isActive debe ser booleano.`);
      if (data.notes !== undefined) assertShortString(data.notes, `${context}.data.notes`, 1_000);
      validateTimestampFields(data, timestampPaths, ['createdAt', 'updatedAt'], [], context);
      break;
    case 'variableExpenses':
      assertOnlyKeys(data, ['date', 'description', 'amount', 'category', 'notes', 'createdAt', 'updatedAt'], `${context}.data`);
      assertCalendarDate(data.date, `${context}.data.date`);
      assertRequiredText(data.description, `${context}.data.description`, 200);
      assertBoundedNumber(data.amount, `${context}.data.amount`, Number.MIN_VALUE, 1_000_000_000_000);
      assertCategory(data.category, `${context}.data.category`);
      if (data.notes !== undefined) assertShortString(data.notes, `${context}.data.notes`, 1_000);
      validateTimestampFields(data, timestampPaths, ['createdAt', 'updatedAt'], [], context);
      break;
    case 'config':
      if (!/^prices-20\d{2}$/.test(id)) {
        throw new BackupValidationError(`${context}.id: solo se admiten documentos prices-AAAA.`);
      }
      assertYear(Number(id.slice('prices-'.length)), `${context}.id`);
      assertOnlyKeys(data, [...MARGIN_KEYS, 'updatedAt'], `${context}.data`);
      for (const key of MARGIN_KEYS) {
        assertBoundedNumber(data[key], `${context}.data.${key}`, 0, 1_000_000_000);
      }
      validateTimestampFields(data, timestampPaths, ['updatedAt'], [], context);
      break;
    case 'priceHistory':
      assertOnlyKeys(data, ['year', ...MARGIN_KEYS, 'changedAt'], `${context}.data`);
      assertYear(data.year, `${context}.data.year`);
      for (const key of MARGIN_KEYS) {
        assertBoundedNumber(data[key], `${context}.data.${key}`, 0, 1_000_000_000);
      }
      validateTimestampFields(data, timestampPaths, ['changedAt'], [], context);
      break;
    case 'goals': {
      assertOnlyKeys(data, [
        'year', 'month', 'targetMargin', 'targetIncome', 'targetSifones', 'targetLitros6',
        'targetLitros12', 'targetLitros20', 'createdAt', 'updatedAt',
      ], `${context}.data`);
      assertYear(data.year, `${context}.data.year`);
      assertMonth(data.month, `${context}.data.month`);
      assertYearMonthDocumentId(id, data.year, data.month, `${context}.id`);
      const monetaryGoals = ['targetMargin', 'targetIncome'] as const;
      const unitGoals = ['targetSifones', 'targetLitros6', 'targetLitros12', 'targetLitros20'] as const;
      if (![...monetaryGoals, ...unitGoals].some((key) => data[key] !== undefined)) {
        throw new BackupValidationError(`${context}.data debe incluir al menos una meta.`);
      }
      for (const key of monetaryGoals) {
        if (data[key] !== undefined) {
          assertBoundedNumber(data[key], `${context}.data.${key}`, 0, 1_000_000_000_000);
        }
      }
      for (const key of unitGoals) {
        if (data[key] !== undefined) {
          assertBoundedInteger(data[key], `${context}.data.${key}`, 0, 1_000_000_000);
        }
      }
      validateTimestampFields(data, timestampPaths, ['updatedAt'], ['createdAt'], context);
      break;
    }
  }
}

function validateMarginMap(value: BackupValue, context: string): void {
  const margin = assertObject(value, context);
  assertOnlyKeys(margin, [...MARGIN_KEYS], context);
  assertRequiredKeys(margin, [...MARGIN_KEYS], context);
  for (const key of MARGIN_KEYS) {
    assertBoundedNumber(margin[key], `${context}.${key}`, 0, 1_000_000_000);
  }
}

function validateTimestampFields(
  data: BackupObject,
  timestampPaths: string[],
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  context: string,
): void {
  for (const field of requiredFields) {
    if (data[field] === undefined) {
      throw new BackupValidationError(`${context}.data.${field} es obligatorio.`);
    }
  }
  const allowedFields = [...requiredFields, ...optionalFields];
  const expectedPaths = allowedFields
    .filter((field) => data[field] !== undefined)
    .map((field) => `/${escapeJsonPointerSegment(field)}`)
    .toSorted();
  const receivedPaths = timestampPaths.toSorted();

  if (
    expectedPaths.length !== receivedPaths.length
    || expectedPaths.some((path, index) => path !== receivedPaths[index])
  ) {
    throw new BackupValidationError(`${context}: las rutas de Timestamp no coinciden con sus campos de fecha.`);
  }
  for (const field of allowedFields) {
    if (data[field] !== undefined) assertHistoricalTimestamp(data[field], `${context}.data.${field}`);
  }
}

function valueAtJsonPointer(value: BackupObject, pointer: string, context: string): BackupValue {
  const segments = pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  let current: BackupValue = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment) || Number(segment) >= current.length) {
        throw new BackupValidationError(`${context}: la ruta Timestamp ${pointer} no existe.`);
      }
      current = current[Number(segment)];
    } else if (isBackupObject(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new BackupValidationError(`${context}: la ruta Timestamp ${pointer} no existe.`);
    }
  }
  return current;
}

function restoreValue(value: BackupValue, path: string, timestampPaths: ReadonlySet<string>): unknown {
  if (timestampPaths.has(path)) return Timestamp.fromDate(new Date(value as string));
  if (Array.isArray(value)) {
    return value.map((item, index) => restoreValue(item, childPath(path, index), timestampPaths));
  }
  if (isBackupObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, restoreValue(item, childPath(path, key), timestampPaths)]),
    );
  }
  return value;
}

interface PlannedRestoreWrite {
  collectionName: BackupCollectionName;
  record: BackupRecord;
  existingData?: DocumentData;
}

const FIXED_SNAPSHOT_FIELDS = [
  'name',
  'amount',
  'dueDate',
  'category',
  'isActive',
  'notes',
] as const;

function sameFixedSnapshot(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return FIXED_SNAPSHOT_FIELDS.every(field => left[field] === right[field]);
}

function sameBackupValue(left: BackupValue | undefined, right: BackupValue | undefined): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameBackupValue(value, right[index]));
  }
  if (isBackupObject(left as BackupValue) || isBackupObject(right as BackupValue)) {
    if (!isBackupObject(left as BackupValue) || !isBackupObject(right as BackupValue)) return false;
    const leftKeys = Object.keys(left as BackupObject).toSorted();
    const rightKeys = Object.keys(right as BackupObject).toSorted();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => (
        key === rightKeys[index]
        && sameBackupValue((left as BackupObject)[key], (right as BackupObject)[key])
      ));
  }
  return false;
}

function sameImmutableBackupRecord(existing: DocumentData, record: BackupRecord): boolean {
  const normalizedExisting = normalizeDocument('priceHistory', record.id, existing);
  return sameBackupValue(normalizedExisting.data, record.data)
    && normalizedExisting.timestampPaths.length === record.timestampPaths.length
    && normalizedExisting.timestampPaths.every((path, index) => path === record.timestampPaths[index]);
}

function restoredDocumentData(write: PlannedRestoreWrite): DocumentData {
  const restoredData = restoreValue(
    write.record.data,
    '',
    new Set(write.record.timestampPaths),
  ) as DocumentData;
  if (write.existingData !== undefined) {
    if (write.existingData.createdAt !== undefined) {
      restoredData.createdAt = write.existingData.createdAt;
    } else {
      // Update rules require createdAt to remain exactly as stored, including
      // legacy documents where the field is absent.
      delete restoredData.createdAt;
    }
  }
  if (COLLECTIONS_WITH_UPDATED_AT.has(write.collectionName)) {
    restoredData.updatedAt = serverTimestamp();
  }
  return restoredData;
}

function addRestoreWrite(
  batch: ReturnType<typeof writeBatch>,
  database: Firestore,
  uid: string,
  write: PlannedRestoreWrite,
): void {
  batch.set(
    doc(database, 'users', uid, write.collectionName, write.record.id),
    restoredDocumentData(write),
    { merge: true },
  );
}

/**
 * Existing documents are merged, missing documents are created, and documents absent from
 * the file are never deleted. The caller must visibly confirm the currently authenticated target.
 */
export async function restoreFullBackup(uid: string, input: unknown): Promise<RestoreResult> {
  return restoreFullBackupToFirestore(getDb(), uid, input);
}

/** @internal Exported so the complete restore path can be exercised against the Firestore emulator. */
export async function restoreFullBackupToFirestore(
  database: Firestore,
  uid: string,
  input: unknown,
): Promise<RestoreResult> {
  assertUid(uid, 'UID actual');
  const backup = validateFullBackup(input);
  const existingSnapshots = await Promise.all(
    BACKUP_COLLECTIONS.map(collectionName => (
      getDocsFromServer(collection(database, 'users', uid, collectionName))
    )),
  );
  const existingByCollection = new Map<BackupCollectionName, Map<string, DocumentData>>(
    BACKUP_COLLECTIONS.map((collectionName, index) => [
      collectionName,
      new Map(existingSnapshots[index].docs.map(snapshotDoc => [snapshotDoc.id, snapshotDoc.data()])),
    ]),
  );
  const existingExpenses = existingByCollection.get('expenses')!;
  const existingVersions = existingByCollection.get('fixedExpenseVersions')!;

  const missingVersions = new Map<string, PlannedRestoreWrite>();
  for (const record of backup.collections.fixedExpenseVersions) {
    const existing = existingVersions.get(record.id);
    if (existing) {
      if (
        existing.expenseId !== record.data.expenseId
        || existing.effectiveFrom !== record.data.effectiveFrom
        || !sameFixedSnapshot(existing, record.data)
      ) {
        throw new BackupValidationError(
          `La version fija ${record.id} ya existe con otro contenido. No se modifico ningun dato.`,
        );
      }
      continue;
    }
    missingVersions.set(record.id, { collectionName: 'fixedExpenseVersions', record });
  }

  const expenseGroups: Array<{
    expense: PlannedRestoreWrite;
    missingVersions: PlannedRestoreWrite[];
  }> = [];
  let skippedDocuments = backup.collections.fixedExpenseVersions.length - missingVersions.size;

  for (const record of backup.collections.expenses) {
    const existing = existingExpenses.get(record.id);
    const backupLatest = record.data.latestEffectiveFrom as string;
    if (existing?.historyVersion === 1) {
      const existingLatest = existing.latestEffectiveFrom;
      if (typeof existingLatest !== 'string') {
        throw new BackupValidationError(
          `El gasto fijo ${record.id} tiene metadatos incompletos en Firestore. No se modifico ningun dato.`,
        );
      }
      if (backupLatest < existingLatest) {
        skippedDocuments += 1;
        continue;
      }
      if (backupLatest === existingLatest) {
        if (!sameFixedSnapshot(existing, record.data)) {
          throw new BackupValidationError(
            `El gasto fijo ${record.id} ya existe con otro contenido para ${backupLatest}. No se modifico ningun dato.`,
          );
        }
        skippedDocuments += 1;
        continue;
      }
    }

    if (existing && existing.createdAt === undefined) {
      throw new BackupValidationError(
        `El gasto fijo ${record.id} no tiene createdAt y no puede combinarse de forma segura. No se modifico ningun dato.`,
      );
    }

    const expenseVersions = [...missingVersions.values()]
      .filter(write => write.record.data.expenseId === record.id);
    if (expenseVersions.length > RESTORE_BATCH_SIZE - 1) {
      throw new BackupValidationError(
        `El gasto fijo ${record.id} tiene demasiadas versiones para restaurarlo atomicamente. No se modifico ningun dato.`,
      );
    }
    expenseVersions.forEach(write => missingVersions.delete(write.record.id));
    expenseGroups.push({
      expense: { collectionName: 'expenses', record, ...(existing ? { existingData: existing } : {}) },
      missingVersions: expenseVersions,
    });
  }

  const otherWrites: PlannedRestoreWrite[] = [];
  for (const collectionName of BACKUP_COLLECTIONS) {
    if (collectionName === 'expenses' || collectionName === 'fixedExpenseVersions') continue;
    const existingDocuments = existingByCollection.get(collectionName)!;
    for (const record of backup.collections[collectionName]) {
      const existing = existingDocuments.get(record.id);

      if (collectionName === 'priceHistory' && existing) {
        if (!sameImmutableBackupRecord(existing, record)) {
          throw new BackupValidationError(
            `El historial de precios ${record.id} ya existe con otro contenido. No se modifico ningun dato.`,
          );
        }
        skippedDocuments += 1;
        continue;
      }

      if (collectionName === 'sales' && existing?.marginSnapshot !== undefined) {
        const normalizedExisting = normalizeDocument(collectionName, record.id, existing);
        if (!sameBackupValue(normalizedExisting.data.marginSnapshot, record.data.marginSnapshot)) {
          throw new BackupValidationError(
            `La venta ${record.id} ya existe con otro margen historico. No se modifico ningun dato.`,
          );
        }
      }

      if (collectionName === 'variableExpenses' && existing && existing.createdAt === undefined) {
        throw new BackupValidationError(
          `El gasto variable ${record.id} no tiene createdAt y no puede combinarse de forma segura. No se modifico ningun dato.`,
        );
      }

      otherWrites.push({
        collectionName,
        record,
        ...(existing ? { existingData: existing } : {}),
      });
    }
  }

  let writtenDocuments = 0;
  try {
    // A fixed expense and all of its missing snapshots are committed together,
    // so a network interruption never exposes a newly restored parent with an
    // incomplete history.
    for (const group of expenseGroups) {
      const batch = writeBatch(database);
      addRestoreWrite(batch, database, uid, group.expense);
      group.missingVersions.forEach(write => addRestoreWrite(batch, database, uid, write));
      await batch.commit();
      writtenDocuments += 1 + group.missingVersions.length;
    }

    const historicalVersions = [...missingVersions.values()];
    for (let index = 0; index < historicalVersions.length; index += 10) {
      const batch = writeBatch(database);
      const writes = historicalVersions.slice(index, index + 10);
      writes.forEach(write => addRestoreWrite(batch, database, uid, write));
      await batch.commit();
      writtenDocuments += writes.length;
    }

    for (let index = 0; index < otherWrites.length; index += RESTORE_BATCH_SIZE) {
      const batch = writeBatch(database);
      const writes = otherWrites.slice(index, index + RESTORE_BATCH_SIZE);
      writes.forEach(write => addRestoreWrite(batch, database, uid, write));
      await batch.commit();
      writtenDocuments += writes.length;
    }
  } catch (error) {
    throw new BackupRestorePartialError(writtenDocuments, error);
  }

  return {
    restoredAt: new Date().toISOString(),
    counts: backup.counts,
    writtenDocuments,
    skippedDocuments,
  };
}

function validateCounts(
  value: unknown,
  expected: BackupCollectionCounts,
  collectionNames: readonly BackupCollectionName[] = BACKUP_COLLECTIONS,
): void {
  const counts = assertObject(value, 'Respaldo.counts');
  const keys = [...collectionNames, 'total'] as const;
  assertOnlyKeys(counts, keys, 'Respaldo.counts');
  assertRequiredKeys(counts, keys, 'Respaldo.counts');
  for (const key of keys) {
    if (!Number.isInteger(counts[key]) || (counts[key] as number) < 0) {
      throw new BackupValidationError(`Respaldo.counts.${key} debe ser un entero no negativo.`);
    }
    if (counts[key] !== expected[key]) {
      throw new BackupValidationError(`Respaldo.counts.${key} no coincide con el contenido.`);
    }
  }
}

function assertObject(value: unknown, context: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new BackupValidationError(`${context} debe ser un objeto.`);
  return value;
}

function assertOnlyKeys(object: Record<string, unknown>, allowed: readonly string[], context: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(object)) {
    assertSafeKey(key, context);
    if (!allowedKeys.has(key)) throw new BackupValidationError(`${context}: la clave "${key}" no es valida.`);
  }
}

function assertRequiredKeys(object: Record<string, unknown>, required: readonly string[], context: string): void {
  for (const key of required) {
    if (!Object.hasOwn(object, key)) throw new BackupValidationError(`${context}: falta la clave "${key}".`);
  }
}

function assertDocumentId(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_500 || value.includes('/')) {
    throw new BackupValidationError(`${context} no es un ID de documento valido.`);
  }
}

function assertUid(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || value.includes('/')) {
    throw new BackupValidationError(`${context} no es valido.`);
  }
}

function assertIsoTimestamp(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string') throw new BackupValidationError(`${context} debe ser una fecha ISO.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new BackupValidationError(`${context} debe ser una fecha ISO UTC normalizada.`);
  }
}

function assertYear(value: unknown, context: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 2000 || (value as number) >= 2100) {
    throw new BackupValidationError(`${context} debe ser un ano entero entre 2000 y 2099.`);
  }
}

function assertMonth(value: unknown, context: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 12) {
    throw new BackupValidationError(`${context} debe ser un mes entre 1 y 12.`);
  }
}

function assertYearMonth(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new BackupValidationError(`${context} debe usar el formato AAAA-MM entre 2000 y 2099.`);
  }
}

function assertBoundedNumber(
  value: unknown,
  context: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new BackupValidationError(`${context} debe ser un numero entre ${minimum} y ${maximum}.`);
  }
}

function assertBoundedInteger(
  value: unknown,
  context: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  assertBoundedNumber(value, context, minimum, maximum);
  if (!Number.isInteger(value)) throw new BackupValidationError(`${context} debe ser un numero entero.`);
}

function assertYearMonthDocumentId(id: string, year: number, month: number, context: string): void {
  const expectedId = `${year}-${String(month).padStart(2, '0')}`;
  if (id !== expectedId) {
    throw new BackupValidationError(`${context} debe ser "${expectedId}" para coincidir con su ano y mes.`);
  }
}

function assertShortString(value: unknown, context: string, maxLength: number): asserts value is string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BackupValidationError(`${context} debe ser texto de hasta ${maxLength} caracteres.`);
  }
}

function assertRequiredText(value: unknown, context: string, maxLength: number): asserts value is string {
  assertShortString(value, context, maxLength);
  if (value.trim().length === 0) throw new BackupValidationError(`${context} no puede estar vacio.`);
}

function assertHistoricalTimestamp(value: unknown, context: string): asserts value is string {
  assertIsoTimestamp(value, context);
  const timestamp = new Date(value).getTime();
  if (timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now()) {
    throw new BackupValidationError(`${context} debe estar entre el 01/01/2000 y el momento actual.`);
  }
}

function assertCategory(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !EXPENSE_CATEGORIES.has(value)) {
    throw new BackupValidationError(`${context} no es una categoria valida.`);
  }
}

function assertCalendarDate(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BackupValidationError(`${context} debe usar el formato AAAA-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new BackupValidationError(`${context} no es una fecha de calendario valida.`);
  }
  assertYear(year, context);
}
