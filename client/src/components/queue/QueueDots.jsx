/** The people ahead of you as a small row of dots, with you at the end. */
export default function QueueDots({ ahead, max = 8 }) {
  const shown = Math.min(ahead, max);
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="h-3 w-3 rounded-full bg-sage/35" />
      ))}
      {ahead > max && <span className="text-xs font-semibold text-ink-muted">+{ahead - max}</span>}
      <span className="ml-0.5 flex items-center gap-1.5">
        <span className="breathe h-3.5 w-3.5 rounded-full bg-apricot" />
        <span className="text-xs font-semibold text-apricot-deep">you</span>
      </span>
    </div>
  );
}
