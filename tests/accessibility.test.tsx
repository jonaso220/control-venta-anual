import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DashboardCharts from '../src/components/DashboardCharts';
import ExpensesPage from '../src/components/ExpensesPage';
import PricesPage from '../src/components/PricesPage';
import SalesPage from '../src/components/SalesPage';
import Sidebar from '../src/components/Sidebar';
import VariableExpensesPage from '../src/components/VariableExpensesPage';
import { AuthContext, type AuthContextType } from '../src/context/AuthContext';
import { ThemeContext, type ThemeContextType } from '../src/context/ThemeContext';
import { ToastProvider } from '../src/context/ToastProvider';
import { useToast } from '../src/context/ToastContext';
import { formatCurrency } from '../src/utils/format';

const authValue: AuthContextType = {
  user: {
    uid: 'test-user',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null,
  },
  loading: false,
  firebaseReady: true,
  signInWithGoogle: vi.fn(),
  logout: vi.fn(),
};

const themeValue: ThemeContextType = {
  dark: false,
  toggle: vi.fn(),
};

function SidebarHarness() {
  const [open, setOpen] = useState(false);

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeContext.Provider value={themeValue}>
        <button type="button" onClick={() => setOpen(true)}>Abrir menú</button>
        <Sidebar
          activeTab="dashboard"
          onTabChange={vi.fn()}
          open={open}
          onOpenChange={setOpen}
        />
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

function ToastHarness({ type }: { type: 'success' | 'error' }) {
  const { toast } = useToast();

  return (
    <button type="button" onClick={() => toast(`Mensaje ${type}`, type)}>
      Mostrar {type}
    </button>
  );
}

describe('accesibilidad de navegación y formularios', () => {
  it('trata el menú móvil como diálogo, atrapa el foco y lo devuelve al cerrar con Escape', async () => {
    const user = userEvent.setup();
    render(<SidebarHarness />);

    const trigger = screen.getByRole('button', { name: 'Abrir menú' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Menú principal' });
    const closeButton = within(dialog).getByRole('button', { name: 'Cerrar menú' });
    const lastButton = within(dialog).getByRole('button', { name: 'Cerrar sesion' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(closeButton).toHaveFocus();
    expect(document.body).toHaveStyle({ overflow: 'hidden' });

    await user.tab({ shift: true });
    expect(lastButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('cierra el diálogo móvil si el viewport pasa al diseño de escritorio', async () => {
    const user = userEvent.setup();
    let viewportListener: ((event: MediaQueryListEvent) => void) | undefined;
    const matchMediaMock = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        viewportListener = listener;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaMock);

    try {
      render(<SidebarHarness />);
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
      expect(screen.getByRole('dialog', { name: 'Menú principal' })).toBeInTheDocument();
      expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 64rem)');

      viewportListener?.({ matches: true } as MediaQueryListEvent);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument());
      expect(document.body.style.overflow).toBe('');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('expone los valores de los gráficos en tablas accesibles sin duplicar el SVG visual', () => {
    render(
      <DashboardCharts
        chartData={[{
          month: 'Ene',
          monthFull: 'Enero',
          margenBruto: 12_000,
          gastos: 4_500,
          resultado: 7_500,
          sifones: 20,
          litros6: 10,
          litros12: 5,
          litros20: 2,
          totalUnidades: 37,
        }]}
        expensesByCategory={[{
          name: 'Vehículo',
          value: 3_200,
          color: '#f59e0b',
        }]}
      />,
    );

    const marginTable = screen.getByRole('table', { name: 'Valores mensuales de margen bruto y gastos' });
    expect(within(marginTable).getByRole('rowheader', { name: 'Enero' })).toBeInTheDocument();
    expect(within(marginTable).getByRole('cell', { name: formatCurrency(12_000) })).toBeInTheDocument();
    expect(within(marginTable).getByRole('cell', { name: formatCurrency(4_500) })).toBeInTheDocument();

    const resultTable = screen.getByRole('table', { name: 'Valores mensuales de resultado neto' });
    expect(within(resultTable).getByRole('cell', { name: formatCurrency(7_500) })).toBeInTheDocument();

    const salesTable = screen.getByRole('table', { name: 'Unidades vendidas por producto y mes' });
    expect(within(salesTable).getByRole('cell', { name: '37' })).toBeInTheDocument();

    const categoryTable = screen.getByRole('table', { name: 'Gastos acumulados por categoría' });
    expect(within(categoryTable).getByRole('rowheader', { name: 'Vehículo' })).toBeInTheDocument();
    expect(within(categoryTable).getByRole('cell', { name: formatCurrency(3_200) })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('expone nombres para los campos de ventas y permite abrir una meta con teclado', async () => {
    const user = userEvent.setup();
    render(
      <SalesPage
        sales={[]}
        prices={{ sifones: 1, litros6: 1, litros12: 1, litros20: 1 }}
        expenses={[]}
        variableExpenses={[]}
        year={2026}
        onSave={vi.fn()}
        onOpenMargins={vi.fn()}
        goals={[]}
        onSaveGoal={vi.fn()}
      />,
    );

    const editJanuaryButtons = screen.getAllByRole('button', { name: 'Editar ventas de Enero' });
    await user.click(editJanuaryButtons[0]);

    expect(screen.getByLabelText('Sifones')).toHaveAttribute('id', 'sales-mobile-2026-1-sifones');
    expect(screen.getByLabelText('Enero: Sifones')).toHaveAttribute('id', 'sales-desktop-2026-1-sifones');

    const defineGoalButton = screen.getByRole('button', { name: 'Definir meta de margen de Enero' });
    defineGoalButton.focus();
    await user.keyboard('{Enter}');

    const goalInput = screen.getByRole('spinbutton', { name: 'Meta de margen para Enero' });
    const goalEditor = goalInput.parentElement as HTMLElement;
    const saveGoalButton = within(goalEditor).getByRole('button', { name: 'Guardar' });
    const cancelGoalButton = within(goalEditor).getByRole('button', { name: 'Cancelar edición de meta de Enero' });

    expect(goalInput).toHaveAttribute('id', 'sales-goal-2026-1-target-margin');
    expect(goalInput).toHaveFocus();

    await user.tab();
    expect(saveGoalButton).toHaveFocus();
    await user.tab();
    expect(cancelGoalButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Definir meta de margen de Enero' })).toHaveFocus();
  });

  it('asocia cada margen visible con su input y su descripción', () => {
    render(
      <PricesPage
        prices={{ sifones: 1, litros6: 2, litros12: 3, litros20: 4 }}
        onSave={vi.fn()}
        year={2026}
        history={[]}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Sifones' })).toHaveAccessibleDescription('Margen por sifón');
    expect(screen.getByRole('spinbutton', { name: '6 Litros' })).toHaveAccessibleDescription('Margen por bidón de 6L');
    expect(screen.getByRole('spinbutton', { name: '12 Litros' })).toHaveAccessibleDescription('Margen por bidón de 12L');
    expect(screen.getByRole('spinbutton', { name: '20 Litros' })).toHaveAccessibleDescription('Margen por bidón de 20L');
  });

  it('nombra los filtros y campos de gastos fijos', async () => {
    const user = userEvent.setup();
    render(
      <ExpensesPage
        expenses={[]}
        effectiveMonth="2026-08"
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Buscar gastos fijos' })).toHaveAttribute('id', 'fixed-expense-search');
    expect(screen.getByRole('combobox', { name: 'Filtrar gastos fijos por categoría' })).toHaveAttribute('id', 'fixed-expense-category-filter');
    expect(screen.getByRole('combobox', { name: 'Filtrar gastos fijos por estado' })).toHaveAttribute('id', 'fixed-expense-status-filter');

    const sortByName = screen.getByRole('button', { name: /Nombre/ });
    expect(sortByName.closest('th')).toHaveAttribute('aria-sort', 'none');
    sortByName.focus();
    await user.keyboard('{Enter}');
    expect(sortByName.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: 'Agregar Gasto' }));
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAttribute('id', 'fixed-new-name');
    expect(screen.getByRole('spinbutton', { name: 'Monto ($)' })).toHaveAttribute('id', 'fixed-new-amount');
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveAttribute('id', 'fixed-new-status');
  });

  it('nombra los filtros y campos de gastos variables', async () => {
    const user = userEvent.setup();
    render(
      <VariableExpensesPage
        expenses={[]}
        year={2026}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Buscar gastos variables' })).toHaveAttribute('id', 'variable-expense-search');
    expect(screen.getByRole('combobox', { name: 'Filtrar gastos variables por mes' })).toHaveAttribute('id', 'variable-expense-month-filter');

    await user.click(screen.getByRole('button', { name: 'Agregar Gasto' }));
    expect(screen.getByLabelText('Fecha')).toHaveAttribute('id', 'variable-new-date');
    expect(screen.getByRole('textbox', { name: 'Descripcion' })).toHaveAttribute('id', 'variable-new-description');
    expect(screen.getByRole('spinbutton', { name: 'Monto ($)' })).toHaveAttribute('id', 'variable-new-amount');
  });

  it('reutiliza el mismo ID al reintentar el alta de un gasto fijo', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('respuesta perdida'))
      .mockResolvedValueOnce(undefined);
    render(
      <ExpensesPage
        expenses={[]}
        effectiveMonth="2026-08"
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Agregar Gasto' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Alquiler');
    await user.type(screen.getByRole('spinbutton', { name: 'Monto ($)' }), '100');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    expect(onSave.mock.calls[0]?.[1]).toBeTruthy();
    expect(onSave.mock.calls[1]?.[1]).toBe(onSave.mock.calls[0]?.[1]);
    expect(onSave.mock.calls[1]?.[2]).toBe(onSave.mock.calls[0]?.[2]);
  });

  it('reutiliza el mismo ID al reintentar el alta de un gasto variable', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('respuesta perdida'))
      .mockResolvedValueOnce(undefined);
    render(
      <VariableExpensesPage
        expenses={[]}
        year={2026}
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Agregar Gasto' }));
    await user.type(screen.getByRole('textbox', { name: 'Descripcion' }), 'Reparación');
    await user.type(screen.getByRole('spinbutton', { name: 'Monto ($)' }), '250');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    expect(onSave.mock.calls[0]?.[1]).toBeTruthy();
    expect(onSave.mock.calls[1]?.[1]).toBe(onSave.mock.calls[0]?.[1]);
  });
});

describe('avisos accesibles', () => {
  it('anuncia los errores de forma asertiva', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastHarness type="error" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Mostrar error' }));
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('anuncia los éxitos de forma no intrusiva', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastHarness type="success" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Mostrar success' }));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
