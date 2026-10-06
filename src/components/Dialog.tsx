import React, { useEffect, useRef } from 'react';

/** Native modal supplies focus containment, Escape handling and focus restoration. */
export function Dialog({ open, onClose, label, children, className = '', closeOnBackdrop = false }: { className?: string; open: boolean; onClose: () => void; label: string; children: React.ReactNode; closeOnBackdrop?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pointerStartedOutside = useRef(false);
  const isBackdrop = (event: React.MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  };
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [open]);
  return <dialog ref={ref} className={`app-dialog ${className}`} dir="rtl" aria-label={label}
    onPointerDown={event => { pointerStartedOutside.current = isBackdrop(event); }}
    onClick={event => {
      if (closeOnBackdrop && pointerStartedOutside.current && isBackdrop(event)) onClose();
      pointerStartedOutside.current = false;
    }}
    onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}
