import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

import { createContext, useContext } from 'react';

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const styles = {
    success: {
      box: 'border-emerald-200 bg-emerald-50',
      badge: 'bg-emerald-100 text-emerald-600',
      text: 'text-emerald-900',
      close: 'text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    error: {
      box: 'border-red-200 bg-red-50',
      badge: 'bg-red-100 text-red-600',
      text: 'text-red-900',
      close: 'text-red-400 hover:bg-red-100 hover:text-red-700',
      icon: <XCircle className="h-4 w-4" />,
    },
    warning: {
      box: 'border-amber-200 bg-amber-50',
      badge: 'bg-amber-100 text-amber-600',
      text: 'text-amber-900',
      close: 'text-amber-500 hover:bg-amber-100 hover:text-amber-700',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    info: {
      box: 'border-[#D9DDFA] bg-[#F3F4FE]',
      badge: 'bg-[#E4E7FC] text-[#5B6EE8]',
      text: 'text-slate-800',
      close: 'text-slate-400 hover:bg-[#E4E7FC] hover:text-slate-600',
      icon: <Info className="h-4 w-4" />,
    },
  }[toast.type];

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex min-w-[280px] items-center gap-3 rounded-xl border py-2.5 pl-3 pr-2.5',
        'shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all duration-300',
        styles.box,
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      )}
    >
      <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full', styles.badge)}>
        {styles.icon}
      </span>
      <p className={cn('flex-1 text-sm font-medium', styles.text)}>{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className={cn('flex-shrink-0 rounded-md p-1 transition-colors', styles.close)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
