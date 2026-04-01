import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { exportFullBackup, exportFullBackupJSON } from './services/export';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SalesPage from './components/SalesPage';
import ExpensesPage from './components/ExpensesPage';
import PricesPage from './components/PricesPage';
import VariableExpensesPage from './components/VariableExpensesPage';
import SettingsPage from './components/SettingsPage';
import YearSelector from './components/YearSelector';
import { Loader2 } from 'lucide-react';
import type { SalesEntry, Expense, PriceConfig, VariableExpense, SalesGoal } from './types';
import { DEFAULT_PRICES } from './types';
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
  savePriceHistory,
  getPriceHistory,
  getGoals,
  saveGoal,
  initializeDefaults,
} from './services/firestore';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [year, setYear] = useState(new Date().getFullYear());
  const [sales, setSales] = useState<SalesEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prices, setPrices] = useState<PriceConfig>(DEFAULT_PRICES);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>([]);
  const [priceHistory, setPriceHistory] = useState<Array<PriceConfig & { changedAt: Date }>>([]);
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const [salesData, expensesData, pricesData, varExpData, historyData, goalsData] = await Promise.all([
        getSalesForYear(user.uid, year),
        getExpenses(user.uid),
        getPrices(user.uid, year),
        getVariableExpenses(user.uid, year),
        getPriceHistory(user.uid, year),
        getGoals(user.uid, year),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setSales(salesData);
      setExpenses(expensesData);
      setPrices(pricesData);
      setVariableExpenses(varExpData);
      setPriceHistory(historyData);
      setGoals(goalsData);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Error loading data:', err);
      toast('Error al cargar datos. Verifica tu conexion a Firebase.', 'error');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [user, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSales = async (entry: SalesEntry) => {
    if (!user) return;
    try {
      await saveSalesEntry(user.uid, entry);
      const updated = await getSalesForYear(user.uid, year);
      setSales(updated);
      toast('Ventas guardadas correctamente');
    } catch (err) {
      console.error('Error saving sales:', err);
      toast('Error al guardar ventas.', 'error');
      throw err;
    }
  };

  const handleSaveExpense = async (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!user) return;
    try {
      await saveExpense(user.uid, expense, id);
      const updated = await getExpenses(user.uid);
      setExpenses(updated);
      toast('Gasto guardado correctamente');
    } catch (err) {
      console.error('Error saving expense:', err);
      toast('Error al guardar gasto.', 'error');
      throw err;
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteExpense(user.uid, id);
      const updated = await getExpenses(user.uid);
      setExpenses(updated);
      toast('Gasto eliminado');
    } catch (err) {
      console.error('Error deleting expense:', err);
      toast('Error al eliminar gasto.', 'error');
      throw err;
    }
  };

  const handleSaveVariableExpense = async (expense: Omit<VariableExpense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!user) return;
    try {
      await saveVariableExpense(user.uid, expense, id);
      const updated = await getVariableExpenses(user.uid, year);
      setVariableExpenses(updated);
      toast('Gasto variable guardado');
    } catch (err) {
      console.error('Error saving variable expense:', err);
      toast('Error al guardar gasto variable.', 'error');
      throw err;
    }
  };

  const handleDeleteVariableExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteVariableExpense(user.uid, id);
      const updated = await getVariableExpenses(user.uid, year);
      setVariableExpenses(updated);
      toast('Gasto variable eliminado');
    } catch (err) {
      console.error('Error deleting variable expense:', err);
      toast('Error al eliminar gasto variable.', 'error');
      throw err;
    }
  };

  const handleSaveGoal = async (goal: Omit<SalesGoal, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return;
    try {
      await saveGoal(user.uid, goal);
      const updated = await getGoals(user.uid, year);
      setGoals(updated);
      toast('Meta guardada correctamente');
    } catch (err) {
      console.error('Error saving goal:', err);
      toast('Error al guardar meta.', 'error');
      throw err;
    }
  };

  const handleSavePrices = async (newPrices: PriceConfig) => {
    if (!user) return;
    try {
      // Save current prices to history before overwriting
      await savePriceHistory(user.uid, year, prices);
      await savePrices(user.uid, newPrices, year);
      setPrices(newPrices);
      const updatedHistory = await getPriceHistory(user.uid, year);
      setPriceHistory(updatedHistory);
      toast('Precios guardados correctamente');
    } catch (err) {
      console.error('Error saving prices:', err);
      toast('Error al guardar precios.', 'error');
      throw err;
    }
  };

  const handleInitDefaults = async () => {
    if (!user) return;
    try {
      await initializeDefaults(user.uid);
      const updated = await getExpenses(user.uid);
      setExpenses(updated);
      toast('Datos inicializados correctamente');
    } catch (err) {
      console.error('Error initializing defaults:', err);
      toast('Error al inicializar datos.', 'error');
      throw err;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-4 flex items-center justify-end sticky top-0 z-10 dark:bg-slate-800 dark:border-slate-700">
          <YearSelector year={year} onChange={setYear} />
        </header>
        <div className="p-4 lg:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard sales={sales} prices={prices} expenses={expenses} year={year} goals={goals} />
              )}
              {activeTab === 'sales' && (
                <SalesPage sales={sales} prices={prices} year={year} onSave={handleSaveSales} goals={goals} onSaveGoal={handleSaveGoal} />
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
                  onInitDefaults={handleInitDefaults}
                  onBackupExcel={() => exportFullBackup(sales, expenses, variableExpenses, prices, year)}
                  onBackupJSON={() => exportFullBackupJSON(sales, expenses, variableExpenses, prices, year)}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
