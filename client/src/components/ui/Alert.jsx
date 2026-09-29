const TONES = {
  error: 'bg-rose-soft text-rose-deep',
  info: 'bg-sage-tint text-ink-soft',
  warn: 'bg-butter-soft text-ink',
  success: 'bg-sage-soft text-sage-deep',
};

export default function Alert({ tone = 'info', title, children, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 ${TONES[tone]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5 text-sm' : 'text-sm'}>{children}</div>}
    </div>
  );
}
