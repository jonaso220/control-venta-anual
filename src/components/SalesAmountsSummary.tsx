import type { PriceConfig, SalesEntry } from '../types';
import { MONTHS } from '../types';
import { salesAmounts, money } from '../domain/pricing';
import { calculateSalesMargin } from '../domain/finance';
import { formatCurrency } from '../utils/format';

export default function SalesAmountsSummary({ sales, prices, year }: { sales: SalesEntry[]; prices: PriceConfig; year: number }) {
  const entries = sales.filter(s => s.year === year).toSorted((a, b) => a.month - b.month);
  const total = entries.reduce((t, s) => {
    const a = salesAmounts(s);
    return { revenue: t.revenue + a.revenue, company: t.company + a.company, unknownUnits: t.unknownUnits + a.unknownUnits, margin: t.margin + calculateSalesMargin(s, prices) };
  }, { revenue: 0, company: 0, unknownUnits: 0, margin: 0 });
  return <section className="card space-y-3">
    <h3 className="text-lg font-semibold">Importes por ventas registradas — {year}</h3>
    <p className="text-sm text-slate-500">Precio al público menos margen propio = importe correspondiente a la empresa. No es un registro de pagos. Ganancia propia antes de gastos.</p>
    {total.unknownUnits > 0 && <p role="status" className="text-amber-700 dark:text-amber-300">Resumen parcial: {total.unknownUnits} unidades sin precio al público histórico. La ganancia propia incluye todos los márgenes guardados. Venta al público e importe empresa incluyen solo precios conocidos.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="table-header"><th className="p-2 text-left">Mes</th><th className="p-2 text-right">Venta al público</th><th className="p-2 text-right">Ganancia propia</th><th className="p-2 text-right">Para la empresa</th></tr></thead>
      <tbody>{entries.map(s => { const a = salesAmounts(s); return <tr key={s.month}><th className="p-2 text-left">{MONTHS[s.month - 1]}</th><td className="p-2 text-right">{a.unknownUnits ? (s.allocations ? `${formatCurrency(a.revenue)} conocido · ${a.unknownUnits} u. sin precio` : 'Precio público no registrado') : formatCurrency(a.revenue)}</td><td className="p-2 text-right">{formatCurrency(calculateSalesMargin(s, prices))}</td><td className="p-2 text-right">{a.unknownUnits ? (s.allocations ? `${formatCurrency(a.company)} conocido · parcial` : 'No calculable sin precio público') : formatCurrency(a.company)}</td></tr>; })}</tbody>
      <tfoot><tr className="font-semibold border-t border-slate-200 dark:border-slate-700"><th className="p-2 text-left">{total.unknownUnits ? 'Subtotal conocido' : 'Total registrado'}</th><td className="p-2 text-right">{formatCurrency(money(total.revenue))}</td><td className="p-2 text-right">{formatCurrency(money(total.margin))}{total.unknownUnits ? ' (todos los registros)' : ''}</td><td className="p-2 text-right">{formatCurrency(money(total.company))}</td></tr></tfoot>
    </table></div>
  </section>;
}
