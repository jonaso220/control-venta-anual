import type { PriceConfig, ProductAmounts } from '../types';
import { PRODUCTS, PRODUCT_LABELS, money, localDate } from '../domain/pricing';
import { formatCurrency } from '../utils/format';

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function previousDate(date: string) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() - 1);
  return result.toISOString().slice(0, 10);
}

export default function PriceTimeline({ prices, year, today = localDate() }: { prices: PriceConfig; year: number; today?: string }) {
  const tariffs = (prices.tariffs ?? []).filter(t => t.effectiveFrom.startsWith(`${year}-`)).toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const periods: { from: string; to: string; margins: ProductAmounts; publicPrices: ProductAmounts | null }[] = [];
  if (!tariffs.length || tariffs[0].effectiveFrom > `${year}-01-01`) {
    periods.push({ from: `${year}-01-01`, to: tariffs.length ? previousDate(tariffs[0].effectiveFrom) : `${year}-12-31`, margins: prices, publicPrices: null });
  }
  tariffs.forEach((t, i) => periods.push({ from: t.effectiveFrom, to: tariffs[i + 1] ? previousDate(tariffs[i + 1].effectiveFrom) : `${year}-12-31`, margins: t.margins, publicPrices: t.publicPrices }));
  const current = periods.find(p => p.from <= today && today <= p.to);
  const ordered = current ? [current, ...periods.filter(p => p !== current)] : periods;
  return <div className="space-y-5">
    <header><h2 className="text-2xl font-bold">Precios y márgenes — {year}</h2><p className="text-slate-500 dark:text-slate-400 mt-1">Cada período conserva sus valores. Precio al público − tu margen = importe para la empresa por unidad.</p></header>
    {ordered.map(period => {
      const active = period === current;
      const legacy = period.publicPrices === null;
      return <section key={period.from} aria-label={`Período desde ${period.from}`} className={`card space-y-4 ${active ? 'ring-2 ring-indigo-500' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className={`text-sm font-semibold ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>{active ? 'Vigente hoy' : period.from > today ? 'Próximo período' : 'Período anterior'}</p>
            <h3 className="text-lg font-bold">{legacy ? `Hasta el ${dateLabel(period.to)}` : `Desde el ${dateLabel(period.from)}`}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{legacy ? `Valores anteriores conservados · año ${year}` : `Hasta el ${dateLabel(period.to)}`}</p>
          </div>
          {legacy && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Márgenes recuperados</span>}
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{PRODUCTS.map((k, i) => <div key={k} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h4 className="font-semibold mb-3">{PRODUCT_LABELS[i]}</h4>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500 dark:text-slate-400">Precio al público</dt><dd className="font-medium">{period.publicPrices ? formatCurrency(period.publicPrices[k]) : 'No registrado'}</dd></div>
            <div><dt className="text-slate-500 dark:text-slate-400">Tu margen por unidad</dt><dd className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(period.margins[k])}</dd></div>
            <div><dt className="text-slate-500 dark:text-slate-400">Para la empresa</dt><dd className="font-medium">{period.publicPrices ? formatCurrency(money(period.publicPrices[k] - period.margins[k])) : 'Sin calcular: falta precio público'}</dd></div>
          </dl>
        </div>)}</div>
        {legacy && <p className="text-sm text-slate-600 dark:text-slate-300">Antes se guardaba tu margen, pero no el precio al público. No necesitas volver a introducir los márgenes. Cada venta mantiene su propio margen histórico; si difiere de esta base, el desglose usa el de esa venta.</p>}
      </section>;
    })}
    <p className="text-xs text-slate-500 dark:text-slate-400">El importe para la empresa se calcula sobre ventas; no acredita pagos. Los cambios de precios no recalculan ventas anteriores.</p>
  </div>;
}
