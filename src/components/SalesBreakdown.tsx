import { saveErrorMessage } from '../domain/feedback';
import { useState } from 'react';
import type { PriceConfig, SalesAllocation, SalesEntry } from '../types';
import { MONTHS } from '../types';
import { monthPeriods, prepareAllocatedSale, PRODUCTS, PRODUCT_LABELS, samePeriods, sumUnits } from '../domain/pricing';
import { calculateSalesMargin } from '../domain/finance';
import { salesAmounts } from '../domain/pricing';
import { formatCurrency } from '../utils/format';

export default function SalesBreakdown({ year, prices, sales, onSave, month, onMonthChange }: {
  month: number; onMonthChange: (month: number) => void;
  year: number; prices: PriceConfig; sales: SalesEntry[]; onSave: (entry: SalesEntry) => Promise<void>;
}) {
  const [rows, setRows] = useState<SalesAllocation[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const existing = sales.find(s => s.month === month);
  const reshaping = Boolean(existing && rows && (!existing.allocations || !samePeriods(rows, existing.allocations)));
  const draft: SalesEntry | null = rows ? { year, month, ...sumUnits(rows), allocations: rows } : null;
  function begin(useCurrent: boolean) {
    try {
      const periods = !useCurrent && existing?.allocations ? existing.allocations : monthPeriods(prices, year, month, existing?.marginSnapshot ?? prices);
      setRows(periods.map(p => {
        const previous = existing?.allocations?.find(row => samePeriods([row], [p]));
        return { ...p, ...(previous ?? {}) };
      }));
      setError(''); setConfirmed(false);
    } catch (e) { setError((e as Error).message); }
  }
  async function save() {
    if (!draft || !confirmed) return;
    setSaving(true); setError('');
    try {
      prepareAllocatedSale(draft, existing, prices);
      await onSave(draft); setRows(null); setConfirmed(false);
    } catch (e) { setError(saveErrorMessage(e)); }
    finally { setSaving(false); }
  }
  return <section className="card space-y-4">
    <h3 className="text-lg font-semibold">Ventas por vigencia</h3>
    <p className="text-sm text-slate-500">Introduce unidades realmente vendidas en cada tramo. No se reparten automáticamente por días. El importe de la empresa es calculado por ventas; no acredita pagos.</p>
    <label className="block max-w-xs">Mes del desglose<select aria-label="Mes del desglose" className="input-field mt-1" value={month} disabled={saving} onChange={e => { onMonthChange(Number(e.target.value)); setRows(null); setError(''); }}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
    {!rows && <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => begin(false)}>{existing?.allocations ? 'Editar cantidades por tramo' : 'Registrar / desglosar mes'}</button>
      {existing?.allocations && <button className="btn-secondary" onClick={() => begin(true)}>Revisar reparto con nuevas vigencias</button>}</div>}
    {rows && draft && <div className="space-y-4">
      {reshaping && <p role="status" className="text-amber-700 dark:text-amber-300">Reparto explícito del total existente. Debes conservar por producto: {PRODUCTS.map((k, i) => `${PRODUCT_LABELS[i]}: ${existing![k]}`).join(' · ')}. Al confirmar, el resultado se calculará con estos tramos; el margen original del mes se conserva en el registro.</p>}
      {rows.some(row => row.publicPriceSnapshot === null) && <p className="text-sm text-slate-600 dark:text-slate-300">El tramo anterior reutiliza los márgenes guardados. Su precio al público no se registró: puedes guardar las cantidades y calcular toda tu ganancia; venta al público e importe empresa quedan parciales.</p>}
      {rows.map((row, index) => <fieldset key={row.from} className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg">
        <legend className="font-semibold px-1">{row.from} a {row.to}</legend>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{PRODUCTS.map((k, i) => <label key={k} className="text-sm">{PRODUCT_LABELS[i]}
          <span className="block text-xs text-slate-500">Público {row.publicPriceSnapshot ? formatCurrency(row.publicPriceSnapshot[k]) : "no registrado"} · margen {formatCurrency(row.marginSnapshot[k])}</span>
          <input aria-label={`${row.from}: ${PRODUCT_LABELS[i]}`} className="input-field mt-1" type="number" min="0" step="1" max="1000000000" value={row[k]} onFocus={e => e.target.select()} onChange={e => { setConfirmed(false); setError(''); setRows(current => current!.map((r, j) => j === index ? { ...r, [k]: e.target.value === '' ? 0 : Number(e.target.value) } : r)); }} />
        </label>)}</div>
      </fieldset>)}
      <p className="text-sm">Total: {PRODUCTS.map((k, i) => `${PRODUCT_LABELS[i]}: ${draft[k]}`).join(' · ')}</p>
      <p className="font-medium">Venta al público{salesAmounts(draft).unknownUnits ? " (subtotal conocido)" : ""}: {formatCurrency(salesAmounts(draft).revenue)} · Ganancia propia: {formatCurrency(calculateSalesMargin(draft, prices))} · Para la empresa{salesAmounts(draft).unknownUnits ? " (subtotal conocido)" : ""}: {formatCurrency(salesAmounts(draft).company)}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo las cantidades de cada tramo y el cálculo mostrado. No representan pagos realizados.</label>
      <div className="flex gap-2"><button className="btn-primary" onClick={save} disabled={saving || !confirmed}>{saving ? 'Guardando…' : 'Guardar desglose'}</button><button className="btn-secondary" disabled={saving} onClick={() => setRows(null)}>Cancelar</button></div>
    </div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
