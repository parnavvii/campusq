/** Accessible modal on the native <dialog> element (focus trap + Esc for free). */
import { useEffect, useRef } from 'react';

export default function Modal({ open, title, onClose, children, width = '28rem' }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{ width: `min(92vw, ${width})` }}
      className="rounded-3xl bg-cream p-0 text-ink shadow-lift backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="p-6 sm:p-7">
          <h2 className="text-2xl font-medium">{title}</h2>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
