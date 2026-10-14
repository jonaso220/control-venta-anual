import { useState } from 'react';
import type { PriceConfig, PriceTariff } from '../types';
import { emptyAmounts, money, PRODUCTS, PRODUCT_LABELS, validateTariffs } from '../domain/pricing';
import { formatCurrency } from '../utils/format';

export default function PriceSchedule({ prices, year, onSave }: {
  prices: PriceConfig; year: number; onSave: (tariff: PriceTariff) => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [publicPrices, setPublicPrices] = useState<Record<string, string>>({});
  const [margins, setMargins] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaved(false); setSaving(true);
    try {
      if (PRODUCTS.some(k => publicPrices[k]?.trim() === undefined || publicPrices[k]?.trim() === '' || margins[k]?.trim() === undefined || margins[k]?.trim() === '')) throw new Error('Completa precio y margen de cada producto; cero es un valor válido.');
      const tariff: PriceTariff = { effectiveFrom: date, publicPrices: emptyAmounts(), margins: emptyAmounts() };
      PRODUCTS.forEach(k => { tariff.publicPrices[k] = Number(publicPrices[k]); tariff.margins[k] = Number(margins[k]); });
      validateTariffs([...(prices.tariffs ?? []), tariff].toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)), year);
      await onSave(tariff); setSaved(true); setDate('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la vigencia.'); }
    finally { setSaving(false); }
  }
  return <section className="card space-y-4">
    <h2 className="text-xl font-bold">Precios por fecha de vigencia — {year}</h2>
    <p className="text-sm text-slate-500">Cada vigencia conserva precio al público y margen propio por unidad. Las ventas anteriores no cambian. Configura también el precio anterior al aumento para poder desglosar todo el mes. Las vigencias corresponden al año seleccionado.</p>
    <form onSubmit={save} className="space-y-4">
      <label className="block">Vigente desde<input aria-label="Vigente desde" className="input-field mt-1 max-w-xs" type="date" required min={`${year}-01-01`} max={`${year}-12-31`} value={date} onChange={e => setDate(e.target.value)} /></label>
      <div className="grid sm:grid-cols-2 gap-4">{PRODUCTS.map((k, i) => <fieldset key={k} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
        <legend className="font-semibold px-1">{PRODUCT_LABELS[i]}</legend>
        <label className="block text-sm">Precio al público<input aria-label={`${PRODUCT_LABELS[i]}: precio al público`} className="input-field mt-1" type="number" min="0" max="1000000000" step="0.01" required value={publicPrices[k] ?? ''} onChange={e => setPublicPrices(p => ({ ...p, [k]: e.target.value }))} /></label>
        <label className="block text-sm">Margen propio por unidad<input aria-label={`${PRODUCT_LABELS[i]}: margen propio`} className="input-field mt-1" type="number" min="0" max="1000000000" step="0.01" required value={margins[k] ?? ''} onChange={e => setMargins(p => ({ ...p, [k]: e.target.value }))} /></label>
        <p className="text-sm">Para la empresa por unidad: {publicPrices[k] !== undefined && margins[k] !== undefined && publicPrices[k] !== '' && margins[k] !== '' ? formatCurrency(money(Number(publicPrices[k]) - Number(margins[k]))) : 'Pendiente'}</p>
      </fieldset>)}</div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {saved && <p role="status">Vigencia guardada; históricos conservados.</p>}
      <button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Añadir vigencia'}</button>
    </form>
    <div className="space-y-3">{prices.tariffs?.map(t => <div className="border-t border-slate-200 dark:border-slate-700 pt-3" key={t.effectiveFrom}>
      <h3 className="font-semibold">Desde {t.effectiveFrom}</h3>
      <ul className="text-sm grid sm:grid-cols-2 gap-2">{PRODUCTS.map((k, i) => <li key={k}>{PRODUCT_LABELS[i]}: público {formatCurrency(t.publicPrices[k])} · propio {formatCurrency(t.margins[k])} · empresa {formatCurrency(money(t.publicPrices[k] - t.margins[k]))}</li>)}</ul>
    </div>)}</div>
    <p className="text-xs text-slate-500">Las vigencias guardadas no se sobrescriben. Añade otra fecha para cambios posteriores. Máximo 24 vigencias por año y dos tramos (un cambio dentro del mes) por mes.</p>
  </section>;
}
