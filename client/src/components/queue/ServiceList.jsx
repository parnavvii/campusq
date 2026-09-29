/** Services as soft cards: what's being served, how many are waiting, the wait if you join now. */
import StatusBadge from '../ui/StatusBadge';
import { minutesLabel } from '../../lib/format';

export default function ServiceList({ services, renderAction, emptyText = 'No services yet.' }) {
  if (!services.length) return <p className="py-6 text-ink-muted">{emptyText}</p>;
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {services.map((s) => (
        <li key={s.id} className="card flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-xl">{s.name}</h3>
              <p className="text-sm text-ink-muted">{s.location}</p>
            </div>
            <StatusBadge status={s.status} />
          </div>
          <dl className="grid grid-cols-3 gap-3 rounded-2xl bg-paper/70 px-4 py-3">
            <div>
              <dt className="text-xs font-medium text-ink-muted">Now serving</dt>
              <dd key={s.currentToken || 'none'} className="flip-in token-numerals mt-1 text-3xl text-apricot-deep">{s.currentToken || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Waiting</dt>
              <dd className="token-numerals mt-1 text-3xl">{s.queueLength}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">If you join now</dt>
              <dd className="mt-1.5 font-semibold">{s.status === 'ACTIVE' ? minutesLabel(s.estimatedWaitMinutes) : '—'}</dd>
              {s.status === 'ACTIVE' && s.bookingsAheadIfJoining > 0 && <dd className="text-xs text-ink-muted">incl. {s.bookingsAheadIfJoining} booked</dd>}
            </div>
          </dl>
          <div className="mt-auto">{renderAction(s)}</div>
        </li>
      ))}
    </ul>
  );
}
