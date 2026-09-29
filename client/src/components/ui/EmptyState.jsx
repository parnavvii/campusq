/** A calm empty state: two soft circles instead of an icon, a sentence, and one action. */
export default function EmptyState({ title, children, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="relative mb-5 h-14 w-20" aria-hidden="true">
        <span className="absolute left-2 top-2 h-12 w-12 rounded-full bg-sage-soft" />
        <span className="absolute right-2 top-0 h-7 w-7 rounded-full bg-butter-soft" />
      </div>
      <p className="font-serif text-xl">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-ink-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
