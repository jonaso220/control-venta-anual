import { LayoutDashboard, ShoppingCart, Receipt, Settings, LogOut, DollarSign, Moon, Sun, X, Wallet } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart },
  { id: 'expenses', label: 'Gastos Fijos', icon: Receipt },
  { id: 'variable-expenses', label: 'Gastos Variables', icon: Wallet },
  { id: 'prices', label: 'Márgenes', icon: DollarSign },
  { id: 'settings', label: 'Configuracion', icon: Settings },
];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Sidebar({ activeTab, onTabChange, open, onOpenChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const mobileDialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const desktopQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 64rem)')
      : null;
    if (desktopQuery?.matches) {
      onOpenChange(false);
      return;
    }
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) onOpenChange(false);
    };
    desktopQuery?.addEventListener('change', handleViewportChange);

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = mobileDialogRef.current;
      if (!dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(element => element.getAttribute('aria-hidden') !== 'true');

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      desktopQuery?.removeEventListener('change', handleViewportChange);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, onOpenChange]);

  function handleNav(id: string) {
    onTabChange(id);
    onOpenChange(false);
  }

  const sidebarContent = (
    <>
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-64x64.png" alt="Logo" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Control de ventas anual</h1>
            <p className="text-xs text-slate-400">Gestion de negocio</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNav(item.id)}
            className={`sidebar-link w-full ${activeTab === item.id ? 'active' : ''}`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <button onClick={toggle} className="sidebar-link w-full mb-1">
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {dark ? 'Modo Claro' : 'Modo Oscuro'}
        </button>
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold">
              {user?.displayName?.[0] || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user?.displayName}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-link w-full text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
        >
          <LogOut className="w-5 h-5" />
          Cerrar sesion
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => onOpenChange(false)}>
          <aside
            ref={mobileDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú principal"
            tabIndex={-1}
            className="relative w-64 max-w-[85vw] bg-white dark:bg-slate-800 flex flex-col h-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 z-10"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex-col min-h-screen">
        {sidebarContent}
      </aside>
    </>
  );
}
