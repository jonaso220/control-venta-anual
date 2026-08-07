import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthProvider';
import { useToast } from './context/ToastContext';
import { ToastProvider } from './context/ToastProvider';
import { ThemeProvider } from './context/ThemeProvider';
import { exportYearExcel } from './services/export';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SalesPage from './components/SalesPage';
import ExpensesPage from './components/ExpensesPage';
import PricesPage from './components/PricesPage';
import VariableExpensesPage from './components/VariableExpensesPage';
import SettingsPage from './components/SettingsPage';
import YearSelector from './components/YearSelector';
import { Loader2, Menu } from 'lucide-react';
import type { SalesEntry, Expense, PriceConfig, VariableExpense, SalesGoal } from './types';
import { EMPTY_MARGINS } from './types';
import {
  getSalesForYear,
  saveSalesEntry,
  getExpenses,
  saveExpense,
  deleteExpense,
  getPrices,
  savePrices,
  getVariableExpenses,
  saveVariableExpense,
  deleteVariableExpense,
  getPriceHistory,
  getGoals,
  saveGoal,
} from './services/firestore';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [sales, setSales] = useState<SalesEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prices, setPrices] = useState<PriceConfig>(EMPTY_MARGINS);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>([]);
  const [priceHistory, setPriceHistory] = useState<Array<PriceConfig & { changedAt: Date }>>([]);
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const activeScope = user ? `${user.uid}:${year}` : null;
  const activeScopeRef = useRef<string | null>(activeScope);

  useEffect(() => {
    activeScopeRef.current = activeScope;
  }, [activeScope]);

  const resetData = useCallback(() => {
    setSales([]);
    setExpenses([]);
    setPrices(EMPTY_MARGINS);
    setVariableExpenses([]);
    setPriceHistory([]);
    setGoals([]);
    setLoadedScope(null);
  }, []);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const requestedScope = user ? `${user.uid}:${year}` : null;

    // Keep the effect subscription synchronous; state changes happen in the
    // asynchronous fetch phase and stale content is already hidden by scopeReady.
    await Promise.resolve();

    resetData();
    setLoadError(null);

    if (!user || !requestedScope) {
      setLoadStatus('idle');
      return;
    }

    setLoadStatus('loading');
    try {
      const [salesData, expensesData, pricesData, varExpData, historyData, goalsData] = await Promise.all([
        getSalesForYear(user.uid, year),
        getExpenses(user.uid),
        getPrices(user.uid, year),
        getVariableExpenses(user.uid, year),
        getPriceHistory(user.uid, year),
        getGoals(user.uid, year),
      ]);

      if (requestId !== loadRequestRef.current || activeScopeRef.current !== requestedScope) return;

      setSales(salesData);
      setExpenses(expensesData);
      setPrices(pricesData);
      setVariableExpenses(varExpData);
      setPriceHistory(historyData);
      setGoals(goalsData);
      setLoadedScope(requestedScope);
      setLoadStatus('ready');
    } catch (err) {
      if (requestId !== loadRequestRef.current || activeScopeRef.current !== requestedScope) return;
      console.error('Error loading data:', err);
      resetData();
      setLoadError('No se pudieron cargar todos los datos de este usuario y año.');
      setLoadStatus('error');
      toast('No se pudieron cargar los datos. Reintenta cuando vuelva la conexión.', 'error');
    }
  }, [resetData, toast, user, year]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadData();
    });
    return () => {
      active = false;
      loadRequestRef.current += 1;
    };
  }, [loadData]);

  const handleSaveSales = async (entry: SalesEntry) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      const savedEntry = await saveSalesEntry(user.uid, entry);
      if (activeScopeRef.current !== requestedScope) return;
      setSales(current => [
        ...current.filter(item => item.month !== savedEntry.month),
        savedEntry,
      ].toSorted((a, b) => a.month - b.month));
      toast('Ventas guardadas correctamente');
    } catch (err) {
      console.error('Error saving sales:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al guardar ventas.', 'error');
      throw err;
    }
  };

  const handleSaveExpense = async (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      await saveExpense(user.uid, expense, id);
      if (activeScopeRef.current !== requestedScope) return;
      const updated = await getExpenses(user.uid);
      if (activeScopeRef.current !== requestedScope) return;
      setExpenses(updated);
      toast('Gasto guardado correctamente');
    } catch (err) {
      console.error('Error saving expense:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al guardar gasto.', 'error');
      throw err;
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      await deleteExpense(user.uid, id);
      if (activeScopeRef.current !== requestedScope) return;
      const updated = await getExpenses(user.uid);
      if (activeScopeRef.current !== requestedScope) return;
      setExpenses(updated);
      toast('Gasto eliminado');
    } catch (err) {
      console.error('Error deleting expense:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al eliminar gasto.', 'error');
      throw err;
    }
  };

  const handleSaveVariableExpense = async (expense: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      await saveVariableExpense(user.uid, expense, id);
      if (activeScopeRef.current !== requestedScope) return;
      const updated = await getVariableExpenses(user.uid, year);
      if (activeScopeRef.current !== requestedScope) return;
      setVariableExpenses(updated);
      toast('Gasto variable guardado');
    } catch (err) {
      console.error('Error saving variable expense:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al guardar gasto variable.', 'error');
      throw err;
    }
  };

  const handleDeleteVariableExpense = async (id: string) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      await deleteVariableExpense(user.uid, id);
      if (activeScopeRef.current !== requestedScope) return;
      const updated = await getVariableExpenses(user.uid, year);
      if (activeScopeRef.current !== requestedScope) return;
      setVariableExpenses(updated);
      toast('Gasto variable eliminado');
    } catch (err) {
      console.error('Error deleting variable expense:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al eliminar gasto variable.', 'error');
      throw err;
    }
  };

  const handleSaveGoal = async (goal: Omit<SalesGoal, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      await saveGoal(user.uid, goal);
      if (activeScopeRef.current !== requestedScope) return;
      const updated = await getGoals(user.uid, year);
      if (activeScopeRef.current !== requestedScope) return;
      setGoals(updated);
      toast('Meta guardada correctamente');
    } catch (err) {
      console.error('Error saving goal:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al guardar meta.', 'error');
      throw err;
    }
  };

  const handleSavePrices = async (newPrices: PriceConfig) => {
    if (!user || !activeScope) return;
    const requestedScope = activeScope;
    try {
      const migratedSales = await savePrices(user.uid, newPrices, year);
      if (activeScopeRef.current !== requestedScope) return;

      setSales(migratedSales);
      setPrices(newPrices);
      toast('Márgenes guardados correctamente');

      try {
        const updatedHistory = await getPriceHistory(user.uid, year);
        if (activeScopeRef.current === requestedScope) setPriceHistory(updatedHistory);
      } catch (historyError) {
        console.error('Margins saved but history refresh failed:', historyError);
        if (activeScopeRef.current === requestedScope) {
          toast('Los márgenes se guardaron, pero no se pudo actualizar el historial en pantalla.', 'info');
        }
      }
    } catch (err) {
      console.error('Error saving prices:', err);
      if (activeScopeRef.current === requestedScope) toast('Error al guardar márgenes.', 'error');
      throw err;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const scopeReady = loadStatus === 'ready' && loadedScope === activeScope;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <main className="flex-1 min-w-0 overflow-auto">
        <header className="bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-8 py-3 lg:py-4 flex items-center gap-3 sticky top-0 z-10 dark:bg-slate-800 dark:border-slate-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
          <div className="ml-auto">
            <YearSelector year={year} onChange={setYear} />
          </div>
        </header>
        <div className="p-3 sm:p-4 lg:p-8">
          {loadStatus === 'error' ? (
            <div role="alert" className="card max-w-xl mx-auto text-center py-10">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                No se pudieron cargar los datos
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                {loadError} No se mostrará información anterior para evitar mezclar usuarios o años.
              </p>
              <button onClick={loadData} className="btn-primary">
                Reintentar
              </button>
            </div>
          ) : !scopeReady ? (
            <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-20 text-slate-500">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <span className="sr-only">Cargando datos del año {year}</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard sales={sales} prices={prices} expenses={expenses} variableExpenses={variableExpenses} year={year} goals={goals} />
              )}
              {activeTab === 'sales' && (
                <SalesPage
                  sales={sales}
                  prices={prices}
                  expenses={expenses}
                  variableExpenses={variableExpenses}
                  year={year}
                  onSave={handleSaveSales}
                  onOpenMargins={() => setActiveTab('prices')}
                  goals={goals}
                  onSaveGoal={handleSaveGoal}
                />
              )}
              {activeTab === 'expenses' && (
                <ExpensesPage expenses={expenses} onSave={handleSaveExpense} onDelete={handleDeleteExpense} />
              )}
              {activeTab === 'variable-expenses' && (
                <VariableExpensesPage expenses={variableExpenses} year={year} onSave={handleSaveVariableExpense} onDelete={handleDeleteVariableExpense} />
              )}
              {activeTab === 'prices' && (
                <PricesPage prices={prices} onSave={handleSavePrices} year={year} history={priceHistory} />
              )}
              {activeTab === 'settings' && (
                <SettingsPage
                  year={year}
                  onExportYearExcel={() => exportYearExcel(sales, expenses, variableExpenses, prices, year)}
                  onRestoreComplete={loadData}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function AppSession() {
  const { user } = useAuth();
  return <AppContent key={user?.uid ?? 'signed-out'} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppSession />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
