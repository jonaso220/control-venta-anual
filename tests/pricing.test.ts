import test from 'node:test';
import assert from 'node:assert/strict';
import { monthPeriods, prepareAllocatedSale, salesAmounts, sumUnits, validateAllocations, validateTariffs } from '../src/domain/pricing.ts';
import { buildMonthlyFinancialResults, calculateSalesMargin } from '../src/domain/finance.ts';
import type { PriceConfig, SalesEntry } from '../src/types.ts';
const amounts = (n: number) => ({ sifones: n, litros6: n, litros12: n, litros20: n });
const prices: PriceConfig = { ...amounts(2), tariffs: [
  { effectiveFrom: '2026-01-01', margins: amounts(2), publicPrices: amounts(10) },
  { effectiveFrom: '2026-10-12', margins: amounts(3), publicPrices: amounts(12) },
] };
function october(): SalesEntry {
  const allocations = monthPeriods(prices, 2026, 10);
  allocations[0].sifones = 4; allocations[1].sifones = 6;
  return { year: 2026, month: 10, ...sumUnits(allocations), allocations };
}
test('12 de octubre es inclusivo, sin reparto diario inventado', () => {
  const rows = monthPeriods(prices, 2026, 10);
  assert.deepEqual(rows.map(r => [r.from, r.to, r.marginSnapshot.sifones]), [
    ['2026-10-01', '2026-10-11', 2], ['2026-10-12', '2026-10-31', 3],
  ]);
  assert.deepEqual(sumUnits(rows), amounts(0));
  assert.equal(monthPeriods(prices, 2026, 11)[0].publicPriceSnapshot.sifones, 12);
  assert.throws(() => monthPeriods(prices, 2027, 1), /Falta/);
});
test('las ventas congeladas concilian público = propio + empresa y alimentan neto', () => {
  const entry = october();
  validateAllocations(entry);
  assert.equal(calculateSalesMargin(entry, amounts(999)), 26);
  assert.deepEqual(salesAmounts(entry), { revenue: 112, company: 86, unknownUnits: 0 });
  const result = buildMonthlyFinancialResults({ sales: [entry], margins: prices, fixedExpenses: [], variableExpenses: [{ date: '2026-10-12', description: 'prueba', amount: 5, category: 'otros' }], year: 2026 });
  assert.equal(result[9].grossMargin, 26); assert.equal(result[9].netResult, 21);
});
test('la conversión exige conservar cantidades y mantiene el snapshot anterior', () => {
  const entry = october();
  const legacy = { ...amounts(0), sifones: 10, year: 2026, month: 10, marginSnapshot: amounts(1) };
  assert.deepEqual(prepareAllocatedSale(entry, legacy, prices).marginSnapshot, amounts(1));
  assert.throws(() => prepareAllocatedSale(entry, { ...legacy, sifones: 11 }, prices), /conservar/);
  assert.deepEqual(salesAmounts(legacy), { revenue: 0, company: 0, unknownUnits: 10 });
  assert.equal(calculateSalesMargin(legacy, prices), 10);
});
test('los snapshots guardados sobreviven a nuevas vigencias; otra tarifa exige revisión', () => {
  const entry = october();
  const changed = { ...prices, tariffs: [...prices.tariffs!, { effectiveFrom: '2026-10-20', margins: amounts(4), publicPrices: amounts(15) }] };
  assert.doesNotThrow(() => prepareAllocatedSale(entry, entry, changed));
  assert.throws(() => prepareAllocatedSale(entry, undefined, changed), /vigencias cambiaron|dos tramos/);
  assert.equal(calculateSalesMargin(entry, changed), 26);
});
test('rechaza huecos, solapamientos, fracciones de unidades, precios negativos y fechas imposibles', () => {
  for (const mutate of [
    (s: SalesEntry) => { s.allocations![1].from = '2026-10-11'; },
    (s: SalesEntry) => { s.allocations![0].sifones = 1.5; },
    (s: SalesEntry) => { s.allocations![0].publicPriceSnapshot.sifones = -1; },
    (s: SalesEntry) => { s.allocations![1].to = '2026-10-32'; },
  ]) { const entry = october(); mutate(entry); assert.throws(() => validateAllocations(entry)); }
  assert.throws(() => validateTariffs([{ effectiveFrom: '2026-02-30', margins: amounts(1), publicPrices: amounts(2) }], 2026));
  assert.throws(() => validateTariffs([{ effectiveFrom: '2026-01-01', margins: amounts(3), publicPrices: amounts(2) }], 2026));
  assert.throws(() => validateTariffs([...prices.tariffs!, prices.tariffs![1]], 2026));
});
test('mes bisiesto, cambio el primer día y céntimos se resuelven sin UTC local', () => {
  const p = { ...amounts(0), tariffs: [{ effectiveFrom: '2024-02-01', margins: amounts(0.1), publicPrices: amounts(0.3) }] };
  const rows = monthPeriods(p, 2024, 2); rows[0].sifones = 3;
  const entry = { year: 2024, month: 2, ...sumUnits(rows), allocations: rows };
  assert.equal(rows[0].to, '2024-02-29'); validateAllocations(entry);
  assert.deepEqual(salesAmounts(entry), { revenue: 0.9, company: 0.6, unknownUnits: 0 });
});
