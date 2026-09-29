export default function PageHeader({ eyebrow, title, description, actions, back }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back}
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-3xl font-medium sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
