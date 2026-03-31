import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SalesPage from './components/SalesPage';
import ExpensesPage from './components/ExpensesPage';
import PricesPage from './components/PricesPage';
import SettingsPage from './components/SettingsPage';
import YearSelector from './components/YearSelector';
import { Loader2 } from 'lucide-react';
import type { SalesEntry, Expense, PriceConfig } from './types';
import { DEFAULT_PRICES } from './types';
import {
  getSalesForYear,
  saveSalesEntry,
  getExpenses,
  saveExpense,
  deleteExpense,
  getPrices,
  savePrices,
  initializeDefaults,
} from './services/firestore';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [year, setYear] = useState(new Date().getFullYear());
  const [sales, setSales] = useState<SalesEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prices, setPrices] = useState<PriceConfig>(DEFAULT_PRICES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [salesData, expensesData, pricesData] = await Promise.all([
        getSalesForYear(user.uid, year),
        getExpenses(user.uid),
        getPrices(user.uid),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setSales(salesData);
      setExpenses(expensesData);
      setPrices(pricesData);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Error loading data:', err);
      setError('Error al cargar datos. Verifica tu conexion a Firebase.');
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
    } catch (err) {
      console.error('Error saving sales:', err);
      setError('Error al guardar ventas.');
      throw err;
    }
  };

  const handleSaveExpense = async (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!user) return;
    try {
      await saveExpense(user.uid, expense, id);
      const updated = await getExpenses(user.uid);
      setExpenses(updated);
    } catch (err) {
      console.error('Error saving expense:', err);
      setError('Error al guardar gasto.');
      throw err;
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteExpense(user.uid, id);
      const updated = await getExpenses(user.uid);
      setExpenses(updated);
    } catch (err) {
      console.error('Error deleting expense:', err);
      setError('Error al eliminar gasto.');
      throw err;
    }
  };

  const handleSavePrices = async (newPrices: PriceConfig) => {
    if (!user) return;
    try {
      await savePrices(user.uid, newPrices);
      setPrices(newPrices);
    } catch (err) {
      console.error('Error saving prices:', err);
      setError('Error al guardar precios.');
      throw err;
    }
  };

  const handleInitDefaults = async () => {
    if (!user) return;
    try {
      await initializeDefaults(user.uid);
      const updated = await getExpenses(user.uid);
      setExpenses(updated);
    } catch (err) {
      console.error('Error initializing defaults:', err);
      setError('Error al inicializar datos.');
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
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div />
          <YearSelector year={year} onChange={setYear} />
        </header>
        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard sales={sales} prices={prices} expenses={expenses} year={year} />
              )}
              {activeTab === 'sales' && (
                <SalesPage sales={sales} prices={prices} year={year} onSave={handleSaveSales} />
              )}
              {activeTab === 'expenses' && (
                <ExpensesPage expenses={expenses} onSave={handleSaveExpense} onDelete={handleDeleteExpense} />
              )}
              {activeTab === 'prices' && (
                <PricesPage prices={prices} onSave={handleSavePrices} />
              )}
              {activeTab === 'settings' && (
                <SettingsPage onInitDefaults={handleInitDefaults} />
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
