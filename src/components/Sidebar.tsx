import { LayoutDashboard, ShoppingCart, Receipt, Settings, LogOut, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart },
  { id: 'expenses', label: 'Gastos', icon: Receipt },
  { id: 'prices', label: 'Precios', icon: DollarSign },
  { id: 'settings', label: 'Configuracion', icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col min-h-screen">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-64x64.png" alt="Logo" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="font-bold text-slate-900 text-sm">Control de ventas anual</h1>
            <p className="text-xs text-slate-400">Gestion de negocio</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`sidebar-link w-full ${activeTab === item.id ? 'active' : ''}`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold">
              {user?.displayName?.[0] || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user?.displayName}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-link w-full text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="w-5 h-5" />
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
}
