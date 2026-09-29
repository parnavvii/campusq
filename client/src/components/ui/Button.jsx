const VARIANTS = {
  primary: 'bg-sage-deep text-cream hover:bg-sage disabled:bg-sage-deep/40',
  accent: 'bg-apricot text-ink hover:brightness-95 disabled:bg-apricot/50',
  go: 'bg-sage text-cream hover:bg-sage-deep disabled:bg-sage/40',
  outline: 'border border-line bg-cream text-ink hover:border-ink/30 hover:bg-white disabled:text-ink-muted',
  danger: 'border border-rose/30 bg-cream text-rose-deep hover:bg-rose-soft disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-ink/5 disabled:opacity-50',
  onDark: 'border border-cream/30 bg-transparent text-cream hover:bg-cream/10 disabled:opacity-50',
  light: 'bg-cream text-sage-deep hover:bg-white disabled:opacity-50',
  butter: 'bg-butter text-ink hover:brightness-95 disabled:bg-butter/30 disabled:text-cream/60',
};
const SIZES = {
  sm: 'min-h-9 px-4 text-sm',
  md: 'min-h-11 px-5 text-[0.95rem]',
  lg: 'min-h-14 px-7 text-lg',
};

export default function Button({ variant = 'primary', size = 'md', busy = false, className = '', children, disabled, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}
