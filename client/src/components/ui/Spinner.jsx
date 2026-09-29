export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-10 text-ink-muted" role="status">
      <span className="breathe h-3 w-3 rounded-full bg-sage" aria-hidden="true" />
      {label}
    </div>
  );
}
