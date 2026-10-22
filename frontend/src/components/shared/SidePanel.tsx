import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SidePanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra class(es) on the panel container */
  className?: string;
}

export function SidePanel({ open, title, onClose, children, className }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  /* Trap focus: move focus into panel when opened */
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <aside
        ref={panelRef}
        className={`side-panel${className ? ` ${className}` : ''}`}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="side-panel__header">
          <h3 className="side-panel__title">{title}</h3>
          <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </header>
        <div className="side-panel__body">
          {children}
        </div>
      </aside>
    </div>
  );
}
