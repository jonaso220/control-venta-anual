import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceTimeline from '../src/components/PriceTimeline';
import PricesPage from '../src/components/PricesPage';
import PriceSchedule from '../src/components/PriceSchedule';
import SalesBreakdown from '../src/components/SalesBreakdown';
import SalesAmountsSummary from '../src/components/SalesAmountsSummary';
import SalesPage from '../src/components/SalesPage';
import { monthPeriods } from '../src/domain/pricing';
import type { SalesEntry } from '../src/types';
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
      await user.clear(screen.getByLabelText(`${product}: precio al público`));
      await user.type(screen.getByLabelText(`${product}: precio al público`), '10');
      await user.clear(screen.getByLabelText(`${product}: margen propio`));
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
    expect(screen.getByText('Precio público no registrado')).toBeVisible();
    expect(screen.getByText('No calculable sin precio público')).toBeVisible();
    expect(screen.getByText(/No es un registro de pagos/)).toBeVisible();
  });
});

describe('Editar un mes que se registra por tramos', () => {
  function renderSalesPage(sales: SalesEntry[], onSave = vi.fn(async () => {})) {
    Element.prototype.scrollIntoView = vi.fn();
    render(<SalesPage sales={sales} prices={prices} expenses={[]} variableExpenses={[]} year={2026} onSave={onSave} onOpenMargins={vi.fn()} goals={[]} onSaveGoal={vi.fn()} />);
    return onSave;
  }
  const clickEditOctober = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getAllByRole('button', { name: 'Editar ventas de Octubre' })[0]);

  it('abre el formulario de octubre sin registro y permite guardar sus ventas', async () => {
    const user = userEvent.setup(); const save = renderSalesPage([]);
    await clickEditOctober(user);
    expect(screen.getByLabelText('Mes del desglose')).toHaveValue('10');
    await user.clear(screen.getByLabelText('2026-10-01: Sifones'));
    await user.type(screen.getByLabelText('2026-10-01: Sifones'), '4');
    await user.clear(screen.getByLabelText('2026-10-12: Sifones'));
    await user.type(screen.getByLabelText('2026-10-12: Sifones'), '6');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Guardar desglose' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ year: 2026, month: 10, sifones: 10 }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('abre con las cantidades guardadas y no pierde lo escrito al pulsar Editar otra vez', async () => {
    const user = userEvent.setup();
    const [before, after] = monthPeriods(prices, 2026, 10);
    renderSalesPage([{ year: 2026, month: 10, ...amounts(0), sifones: 7, marginSnapshot: amounts(2), allocations: [{ ...before, sifones: 3 }, { ...after, sifones: 4 }] }]);
    await clickEditOctober(user);
    const first = screen.getByLabelText('2026-10-01: Sifones');
    expect(first).toHaveValue(3);
    await user.clear(first); await user.type(first, '5');
    await clickEditOctober(user);
    expect(screen.getByLabelText('2026-10-01: Sifones')).toHaveValue(5);
  });

  it('cambiar de mes en el selector no abre el formulario por su cuenta', async () => {
    const user = userEvent.setup(); renderSalesPage([]);
    await clickEditOctober(user);
    await user.selectOptions(screen.getByLabelText('Mes del desglose'), '11');
    expect(screen.getByRole('button', { name: 'Registrar / desglosar mes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar desglose' })).not.toBeInTheDocument();
  });
});

it('presenta períodos equivalentes, destaca hoy y no inventa precios anteriores', () => {
  render(<PriceTimeline year={2026} today="2026-10-14" prices={{ ...amounts(2), tariffs: prices.tariffs.slice(1) }} />);
  const current = screen.getByRole('region', { name: 'Período desde 2026-10-12' });
  const old = screen.getByRole('region', { name: 'Período desde 2026-01-01' });
  expect(within(current).getByText('Vigente hoy')).toBeVisible();
  expect(within(current).getByText('Desde el 12 de octubre de 2026')).toBeVisible();
  expect(within(old).getByText('Hasta el 11 de octubre de 2026')).toBeVisible();
  expect(within(old).getAllByText('No registrado')).toHaveLength(4);
  expect(within(current).queryByText('No registrado')).not.toBeInTheDocument();
});

it('una vigencia futura no se presenta como actual', () => {
  render(<PriceTimeline year={2026} today="2026-10-01" prices={{ ...amounts(2), tariffs: prices.tariffs.slice(1) }} />);
  expect(within(screen.getByRole('region', { name: 'Período desde 2026-01-01' })).getByText('Vigente hoy')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Período desde 2026-10-12' })).getByText('Próximo período')).toBeVisible();
});

it('separa el formulario y reutiliza los valores conocidos sin guardar al abrir', async () => {
  const save = vi.fn(); const user = userEvent.setup();
  render(<PricesPage year={2026} prices={{ ...amounts(2), tariffs: [] }} history={[]} onSave={save} onSaveTariff={save} />);
  expect(screen.queryByLabelText('Vigente desde')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Registrar cambio de precios' }));
  expect(screen.getByLabelText('Sifones: margen propio')).toHaveValue(2);
  expect(screen.getByLabelText('Sifones: precio al público')).toHaveValue(null);
  expect(save).not.toHaveBeenCalled();
});

it('permite desglosar sin precio anterior y conserva el margen específico de la venta', async () => {
  const save = vi.fn(async () => {}); const user = userEvent.setup();
  render(<SalesBreakdown year={2026} month={10} onMonthChange={() => {}} prices={{ ...amounts(9), tariffs: prices.tariffs.slice(1) }} sales={[legacy]} onSave={save} />);
  await user.click(screen.getByRole('button', { name: 'Registrar / desglosar mes' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('2026-10-01: Sifones'));
  await user.type(screen.getByLabelText('2026-10-01: Sifones'), '4');
  await user.clear(screen.getByLabelText('2026-10-12: Sifones'));
  await user.type(screen.getByLabelText('2026-10-12: Sifones'), '6');
  expect(screen.getByText(/Venta al público \(subtotal conocido\)/)).toHaveTextContent('72');
  expect(screen.getByText(/Ganancia propia:/)).toHaveTextContent('26');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Guardar desglose' }));
  const submitted = save.mock.calls[0][0];
  expect(submitted.allocations[0].marginSnapshot.sifones).toBe(2);
  expect(submitted.allocations[0].publicPriceSnapshot).toBe(null);
  expect(submitted.allocations[1].publicPriceSnapshot.sifones).toBe(12);
});

it('al completar un precio antiguo precarga el margen anterior y conserva vacío lo desconocido', async () => {
  const user = userEvent.setup();
  render(<PriceSchedule year={2026} prices={{ ...amounts(2), tariffs: prices.tariffs.slice(1) }} onSave={vi.fn()} />);
  await user.type(screen.getByLabelText('Vigente desde'), '2026-01-01');
  expect(screen.getByLabelText('Sifones: margen propio')).toHaveValue(2);
  expect(screen.getByLabelText('Sifones: precio al público')).toHaveValue(null);
});

it('guarda una nueva vigencia con valores precargados y muestra confirmación', async () => {
  const save = vi.fn(async () => {}); const user = userEvent.setup();
  render(<PriceSchedule year={2026} prices={prices} onSave={save} />);
  await user.type(screen.getByLabelText('Vigente desde'), '2026-11-01');
  await user.clear(screen.getByLabelText('Sifones: margen propio'));
  await user.type(screen.getByLabelText('Sifones: margen propio'), '4');
  await user.click(screen.getByRole('button', { name: 'Añadir vigencia' }));
  expect(save).toHaveBeenCalledWith({ effectiveFrom: '2026-11-01', margins: { ...amounts(3), sifones: 4 }, publicPrices: amounts(12) });
  expect(screen.getByRole('status')).toHaveTextContent('Vigencia guardada; históricos conservados.');
});
