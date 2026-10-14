import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import YearSelector from '../src/components/YearSelector';
import VariableExpensesPage from '../src/components/VariableExpensesPage';
import ExpensesPage from '../src/components/ExpensesPage';
import { saveErrorMessage } from '../src/domain/feedback';

it('permite seleccionar directamente un año sin recorrer todas las flechas', async () => {
  const change = vi.fn(); const user = userEvent.setup();
  render(<YearSelector year={2026} onChange={change} />);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Año de consulta' }), '2021');
  expect(change).toHaveBeenCalledWith(2021);
});

it('explica importes inválidos y conserva el gasto tras un fallo para reintentar', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValueOnce(Object.assign(new Error('offline'), {code:'unavailable'})).mockResolvedValue(undefined);
  render(<VariableExpensesPage year={2026} expenses={[]} onSave={save} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name:'Agregar Gasto' }));
  await user.type(screen.getByLabelText('Descripcion'), 'Compra de prueba');
  await user.click(screen.getByRole('button', { name:'Guardar', exact:true }));
  expect(screen.getByRole('alert')).toHaveTextContent('importe mayor que cero');
  expect(save).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Monto ($)'), '25');
  await user.click(screen.getByRole('button', { name:'Guardar', exact:true }));
  expect(screen.getByRole('alert')).toHaveTextContent('comprueba la conexión');
  expect(screen.getByLabelText('Descripcion')).toHaveValue('Compra de prueba');
  expect(screen.getByLabelText('Monto ($)')).toHaveValue(25);
  await user.click(screen.getByRole('button', { name:'Guardar', exact:true }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][1]).toBe(save.mock.calls[0][1]);
  expect(screen.getByRole('status')).toHaveTextContent('Gasto variable guardado');
});

it('evita descartar un gasto fijo mientras se está guardando y anuncia el resultado', async () => {
  const user = userEvent.setup(); let finish: (() => void) | undefined;
  const save = vi.fn(() => new Promise<void>(resolve=>{finish=resolve;}));
  render(<ExpensesPage expenses={[]} effectiveMonth="2026-10" onSave={save} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button',{name:'Agregar Gasto'}));
  await user.type(screen.getByLabelText('Nombre'),'Servicio de prueba');
  await user.type(screen.getByLabelText('Monto ($)'),'30');
  await user.click(screen.getByRole('button',{name:'Guardar',exact:true}));
  expect(screen.getByRole('button',{name:'Cancelar'})).toBeDisabled();
  expect(screen.getByLabelText('Monto ($)')).toBeDisabled();
  finish!();
  expect(await screen.findByRole('status')).toHaveTextContent('Gasto fijo guardado');
});

it('distingue una búsqueda sin resultados y permite limpiar los filtros', async () => {
  const user = userEvent.setup();
  render(<VariableExpensesPage year={2026} expenses={[{id:'one',date:'2026-10-01',description:'Combustible',amount:10,category:'vehiculo'}]} onSave={vi.fn()} onDelete={vi.fn()} />);
  await user.type(screen.getByLabelText('Buscar gastos variables'), 'inexistente');
  expect(screen.getAllByText('No hay gastos que coincidan con estos filtros.').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button',{name:'Limpiar filtros'}));
  expect(screen.getByLabelText('Buscar gastos variables')).toHaveValue('');
  expect(screen.getAllByText('Combustible').length).toBeGreaterThan(0);
});

it('traduce errores de permisos sin indicar un guardado exitoso', () => {
  expect(saveErrorMessage(new Error('Missing or insufficient permissions.'))).toContain('No tienes permiso');
  expect(saveErrorMessage(new Error('El total no coincide.'))).toBe('El total no coincide.');
});
