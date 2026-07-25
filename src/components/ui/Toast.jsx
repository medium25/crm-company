import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const TYPE_STYLES = {
  success: { icon: CheckCircle2, iconClass: 'text-success' },
  error: { icon: XCircle, iconClass: 'text-danger' },
};

/**
 * Любая мутация → toast с результатом. Оборачивает приложение один раз в App.jsx.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, { type = 'success', duration = 3000, actionLabel, onAction } = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, message, type, actionLabel, onAction }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className="fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
          {toasts.map((t) => {
            const { icon: Icon, iconClass } = TYPE_STYLES[t.type] ?? TYPE_STYLES.success;
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-hover"
              >
                <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
                <span className="flex-1 text-[15px] text-text">{t.message}</span>
                {t.actionLabel && (
                  <button
                    type="button"
                    className="text-[13px] font-bold text-link"
                    onClick={() => {
                      t.onAction?.();
                      dismiss(t.id);
                    }}
                  >
                    {t.actionLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast должен вызываться внутри ToastProvider');
  return ctx;
}
