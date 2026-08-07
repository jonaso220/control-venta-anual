import { useCallback, useState, type ReactNode } from 'react';
import { CheckCircle, Info, X, XCircle } from 'lucide-react';
import { ToastContext, type ToastType } from './ToastContext';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts(previous => [...previous, { id, message, type }]);
    setTimeout(() => {
      setToasts(previous => previous.filter(item => item.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(previous => previous.filter(item => item.id !== id));
  }, []);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500 shrink-0" aria-hidden="true" />,
    error: <XCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0" aria-hidden="true" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(item => (
          <div
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
            aria-live={item.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-in ${bgColors[item.type]}`}
          >
            {icons[item.type]}
            <span className="text-sm font-medium text-slate-700">{item.message}</span>
            <button onClick={() => dismiss(item.id)} className="ml-2 text-slate-400 hover:text-slate-600" aria-label="Cerrar aviso">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
