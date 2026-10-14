import type { PriceConfig, PriceTariff, ProductAmounts, SalesAllocation, SalesEntry } from '../types';

export const PRODUCTS = ['sifones', 'litros6', 'litros12', 'litros20'] as const;
export const PRODUCT_LABELS = ['Sifones', '6 Litros', '12 Litros', '20 Litros'];
export const MAX_TARIFFS = 24;
export const MAX_MONTH_PERIODS = 2;
export const emptyAmounts = (): ProductAmounts => ({ sifones: 0, litros6: 0, litros12: 0, litros20: 0 });
export const sameAmounts = (a: ProductAmounts, b: ProductAmounts) => PRODUCTS.every(k => a[k] === b[k]);
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validAmounts(value: unknown, units = false): value is ProductAmounts {
  if (!value || typeof value !== 'object') return false;
  const map = value as ProductAmounts;
  return Object.keys(map).length === 4 && PRODUCTS.every(k => typeof map[k] === 'number'
    && Number.isFinite(map[k]) && map[k] >= 0 && map[k] <= 1e9
    && (units ? Number.isInteger(map[k]) : Math.abs(map[k] * 100 - Math.round(map[k] * 100)) < 0.00001));
}
export function validateTariffs(value: unknown, year: number): asserts value is PriceTariff[] {
  if (!Array.isArray(value) || value.length > MAX_TARIFFS) throw new Error(`Se admiten hasta ${MAX_TARIFFS} vigencias por año.`);
  for (let month = 1; month <= 12; month++) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    if (1 + value.filter((t: PriceTariff) => t?.effectiveFrom?.startsWith(prefix) && !t.effectiveFrom.endsWith('-01')).length > MAX_MONTH_PERIODS) throw new Error('Se admiten hasta dos tramos de vigencia por mes.');
  }
  value.forEach((t: PriceTariff, i) => {
    if (!t || Object.keys(t).length !== 3 || !validDate(t.effectiveFrom) || !t.effectiveFrom.startsWith(`${year}-`)
      || !validAmounts(t.margins) || !validAmounts(t.publicPrices)
      || PRODUCTS.some(k => t.margins[k] > t.publicPrices[k])
      || (i > 0 && value[i - 1].effectiveFrom >= t.effectiveFrom)) {
      throw new Error('Revisa las fechas, el orden de vigencias y los importes (máximo dos decimales; margen ≤ precio al público).');
    }
  });
}
export function monthPeriods(prices: PriceConfig, year: number, month: number): SalesAllocation[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const first = `${prefix}-01`;
  const last = `${prefix}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  const tariffs = (prices.tariffs ?? []).filter(t => t.effectiveFrom.startsWith(`${year}-`));
  const starts = [first, ...tariffs.map(t => t.effectiveFrom).filter(d => d > first && d <= last)];
  if (starts.length > MAX_MONTH_PERIODS) throw new Error('Se admiten hasta dos tramos de vigencia por mes.');
  return starts.map((from, index) => {
    const tariff = tariffs.findLast(t => t.effectiveFrom <= from);
    if (!tariff) throw new Error(`Falta un precio vigente el ${from}. Añade la vigencia anterior con sus valores reales.`);
    const end = index + 1 < starts.length ? new Date(`${starts[index + 1]}T00:00:00Z`) : null;
    end?.setUTCDate(end.getUTCDate() - 1);
    return { ...emptyAmounts(), tariffFrom: tariff.effectiveFrom, from, to: end ? end.toISOString().slice(0, 10) : last,
      marginSnapshot: { ...tariff.margins }, publicPriceSnapshot: { ...tariff.publicPrices } };
  });
}
export function samePeriods(a: SalesAllocation[], b: SalesAllocation[]): boolean {
  return a.length === b.length && a.every((p, i) => p.tariffFrom === b[i].tariffFrom && p.from === b[i].from && p.to === b[i].to
    && sameAmounts(p.marginSnapshot, b[i].marginSnapshot) && sameAmounts(p.publicPriceSnapshot, b[i].publicPriceSnapshot));
}
export function sumUnits(rows: ProductAmounts[]): ProductAmounts {
  return Object.fromEntries(PRODUCTS.map(k => [k, rows.reduce((total, row) => total + row[k], 0)])) as unknown as ProductAmounts;
}
/** Validate saved snapshots without consulting today's configuration (backup/history). */
export function validateAllocations(entry: SalesEntry): void {
  const rows = entry.allocations;
  if (!validAmounts(Object.fromEntries(PRODUCTS.map(k => [k, entry[k]])), true)) throw new Error('Los totales deben ser unidades enteras entre cero y mil millones.');
  if (!rows || rows.length < 1 || rows.length > MAX_MONTH_PERIODS) throw new Error('Desglose vacío o demasiado largo.');
  const prefix = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
  let next = `${prefix}-01`;
  for (const row of rows) {
    const units = Object.fromEntries(PRODUCTS.map(k => [k, row[k]]));
    if (Object.keys(row).length !== 9 || !validDate(row.tariffFrom) || row.tariffFrom > row.from || !validDate(row.from) || !validDate(row.to)
      || row.from !== next || row.to < row.from || !row.to.startsWith(prefix)
      || !validAmounts(units, true) || !validAmounts(row.marginSnapshot) || !validAmounts(row.publicPriceSnapshot)
      || PRODUCTS.some(k => row.marginSnapshot[k] > row.publicPriceSnapshot[k])) throw new Error('Desglose inválido: revisa fechas, unidades y precios.');
    const following = new Date(`${row.to}T00:00:00Z`);
    following.setUTCDate(following.getUTCDate() + 1);
    next = following.toISOString().slice(0, 10);
  }
  if (next !== new Date(Date.UTC(entry.year, entry.month, 1)).toISOString().slice(0, 10)
    || !sameAmounts(sumUnits(rows), entry)) throw new Error('El desglose debe cubrir el mes y coincidir con sus totales.');
}
export function prepareAllocatedSale(entry: SalesEntry, existing: SalesEntry | undefined, prices: PriceConfig): SalesEntry {
  validateAllocations(entry);
  const rows = entry.allocations!;
  const unchangedPeriods = existing?.allocations && samePeriods(rows, existing.allocations);
  if (!unchangedPeriods && !samePeriods(rows, monthPeriods(prices, entry.year, entry.month))) {
    throw new Error('Las vigencias cambiaron. Recarga y revisa el desglose antes de guardar.');
  }
  if (existing && !unchangedPeriods && !sameAmounts(entry, existing)) {
    throw new Error('Al desglosar o cambiar los tramos debes conservar las unidades anteriores de cada producto. Después podrás editar las cantidades.');
  }
  return { ...entry, marginSnapshot: existing?.marginSnapshot ?? Object.fromEntries(PRODUCTS.map(k => [k, prices[k]])) as unknown as ProductAmounts };
}
export function salesAmounts(entry: SalesEntry | undefined): { revenue: number; company: number; unknownUnits: number } {
  if (!entry) return { revenue: 0, company: 0, unknownUnits: 0 };
  if (!entry.allocations) return { revenue: 0, company: 0, unknownUnits: PRODUCTS.reduce((n, k) => n + entry[k], 0) };
  let revenue = 0; let margin = 0;
  for (const row of entry.allocations) for (const k of PRODUCTS) {
    revenue += row[k] * row.publicPriceSnapshot[k]; margin += row[k] * row.marginSnapshot[k];
  }
  return { revenue: money(revenue), company: money(revenue - margin), unknownUnits: 0 };
}
