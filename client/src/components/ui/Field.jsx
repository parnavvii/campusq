/** Label-above-input field with hint and error linked via aria-describedby. */
export default function Field({ id, label, hint, error, children, required }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink-soft">
        {label}
        {required && <span className="font-normal text-ink-muted"> (required)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined })}
      {hint && !error && <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-rose-deep">{error}</p>}
    </div>
  );
}
