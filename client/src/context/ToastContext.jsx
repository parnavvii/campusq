import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TONES = {
  success: ['bg-cream', 'bg-sage'],
  error: ['bg-cream', 'bg-rose'],
  info: ['bg-cream', 'bg-butter'],
  turn: ['bg-sage-deep text-cream', 'bg-butter'],
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (tone, title, body, ms = 4500) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, tone, title, body }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (title, body) => push('success', title, body),
      error: (title, body) => push('error', title, body, 6000),
      info: (title, body) => push('info', title, body),
      turn: (title, body) => push('turn', title, body, 9000),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`toast-in pointer-events-auto w-full max-w-sm rounded-2xl px-4 py-3 shadow-lift ${TONES[t.tone][0]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONES[t.tone][1]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.title}</p>
                {t.body && <p className={`mt-0.5 text-sm ${t.tone === 'turn' ? 'text-cream/80' : 'text-ink-muted'}`}>{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-mr-1 rounded px-1 text-lg leading-none opacity-60 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
