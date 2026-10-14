import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceSchedule from '../src/components/PriceSchedule';
import SalesBreakdown from '../src/components/SalesBreakdown';
import SalesAmountsSummary from '../src/components/SalesAmountsSummary';
const amounts = (n: number) => ({ sifones: n, litros6: n, litros12: n, litros20: n });
const prices = { ...amounts(2), tariffs: [
  { effectiveFrom: '2026-01-01', margins: amounts(2), publicPrices: amounts(10) },
  { effectiveFrom: '2026-10-12', margins: amounts(3), publicPrices: amounts(12) },
] };
const legacy = { year: 2026, month: 10, ...amounts(0), sifones: 10, marginSnapshot: amounts(2) };
describe('precios por fecha y desglose explícito', () => {
  it('no guarda precios incompletos ni margen mayor que precio público', async () => {
    const user = userEvent.setup(); const save = vi.fn();
    render(<PriceSchedule year={2026} prices={prices} onSave={save} />);
    await user.type(screen.getByLabelText('Vigente desde'), '2026-11-01');
    for (const product of ['Sifones', '6 Litros', '12 Litros', '20 Litros']) {
      await user.type(screen.getByLabelText(`${product}: precio al público`), '10');
      await user.type(screen.getByLabelText(`${product}: margen propio`), '11');
    }
    await user.click(screen.getByRole('button', { name: 'Añadir vigencia' }));
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('margen ≤ precio');
  });
  it('impide repartir 9 de 10 unidades; exige confirmación antes de guardar 4 + 6', async () => {
    const user = userEvent.setup(); const save = vi.fn(async () => {});
    render(<SalesBreakdown year={2026} month={10} onMonthChange={() => {}} prices={prices} sales={[legacy]} onSave={save} />);
    await user.click(screen.getByRole('button', { name: 'Registrar / desglosar mes' }));
    const first = screen.getByLabelText('2026-10-01: Sifones');
    const second = screen.getByLabelText('2026-10-12: Sifones');
    await user.clear(first); await user.type(first, '4');
    await user.clear(second); await user.type(second, '5');
    expect(screen.getByRole('button', { name: 'Guardar desglose' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Guardar desglose' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('conservar las unidades');
    expect(save).not.toHaveBeenCalled();
    await user.clear(second); await user.type(second, '6');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Guardar desglose' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].sifones).toBe(10);
  });
  it('advierte importes incompletos sin confundirlos con pagos ni quitar márgenes legacy', () => {
    render(<SalesAmountsSummary year={2026} prices={prices} sales={[legacy]} />);
    expect(screen.getByRole('status')).toHaveTextContent('10 unidades sin precio al público histórico');
    expect(screen.getAllByText('Pendiente de desglose')).toHaveLength(2);
    expect(screen.getByText(/No es un registro de pagos/)).toBeVisible();
  });
});
