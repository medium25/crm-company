import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const WIDTH_CLASSES = {
  form: 'max-w-[520px]',
  table: 'max-w-[720px]',
};

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {'form'|'table'} [props.width]
 * @param {import('react').ReactNode} [props.footer]
 */
export function Modal({ open, onClose, title, width = 'form', footer, children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,24,40,.45)] p-4">
      <div
        className={`w-full ${WIDTH_CLASSES[width]} rounded-2xl bg-surface shadow-modal`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border p-6">
          <h2 className="text-xl font-bold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted hover:bg-surface-alt"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-border p-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
