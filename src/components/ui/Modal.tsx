import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({ open, onClose, title, description, children, size = 'md', footer }: ModalProps) {
  const panelRef     = useRef<HTMLDivElement>(null);
  const onCloseRef   = useRef(onClose);
  const triggerRef   = useRef<HTMLElement | null>(null); // element focused before modal opened
  const didFocusRef  = useRef(false);                    // auto-focus only once per open

  // Keep onCloseRef current without adding onClose to effect deps
  onCloseRef.current = onClose;

  // ── Open / close lifecycle ──────────────────────────────────────────────
  // Only depends on `open` — changing onClose never restarts this effect,
  // so typing in a form field (which recreates inline callbacks in parent)
  // will NOT cause cleanup+re-run → no focus steal.
  useEffect(() => {
    if (!open) {
      // Restore focus to whatever triggered the modal
      triggerRef.current?.focus();
      triggerRef.current = null;
      didFocusRef.current = false;
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    triggerRef.current = document.activeElement as HTMLElement;

    // Auto-focus first field — only once per open session
    if (!didFocusRef.current) {
      didFocusRef.current = true;
      const raf = requestAnimationFrame(() => {
        const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
        first?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [open]); // ← only `open`, NOT onClose

  // ── Keyboard handling (Escape + focus trap) ─────────────────────────────
  // Separate effect so it can use the always-current onCloseRef.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!panelRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn(
          // Column layout: header and footer stay put, only the body scrolls,
          // and the whole panel can use almost the full screen height.
          'relative z-10 flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[20px] bg-white shadow-xl transition-all duration-200',
          sizeClasses[size]
        )}
      >
        <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="modal-title" className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-[10px] p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-[#F7F8FE] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmText = 'Confirm', cancelText = 'Cancel',
  variant = 'default', loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-[10px] border border-slate-200 bg-white px-4 h-9 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={async () => { await onConfirm(); onClose(); }}
            disabled={loading}
            className={cn(
              'inline-flex items-center gap-2 rounded-[10px] h-9 px-4 text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#5B6EE8] hover:bg-[#4B5DD8]'
            )}
          >
            {loading && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}
