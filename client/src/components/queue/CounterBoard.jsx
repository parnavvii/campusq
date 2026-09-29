/** The staff's "now serving" panel. */
export default function CounterBoard({ token, caption, children }) {
  return (
    <section aria-label="Now serving" className="rounded-3xl bg-sage-deep p-6 text-cream shadow-lift sm:p-7">
      <p className="text-sm font-medium text-cream/70">Now serving</p>
      <p key={token || 'none'} className="flip-in token-numerals mt-2 text-8xl text-butter sm:text-9xl" aria-live="polite">
        {token || '—'}
      </p>
      {caption && <p className="mt-3 text-cream/85">{caption}</p>}
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
