/** Status pill: soft colour plus a small shape cue, and always a word (never colour alone). */
const STYLES = {
  ACTIVE: ['bg-sage-soft text-sage-deep', 'bg-sage', 'Open'],
  PAUSED: ['bg-butter-soft text-butter-deep', 'bg-butter', 'Paused'],
  CLOSED: ['bg-ink/5 text-ink-muted', 'bg-ink-muted', 'Closed'],
  WAITING: ['bg-ink/5 text-ink-soft', 'border border-ink-muted', 'Waiting'],
  SERVING: ['bg-apricot-soft text-apricot-deep', 'bg-apricot', 'Being served'],
  COMPLETED: ['bg-sage-soft text-sage-deep', 'bg-sage', 'Done'],
  SKIPPED: ['bg-rose-soft text-rose-deep', 'bg-rose', 'Skipped'],
  CANCELLED: ['bg-ink/5 text-ink-muted', 'bg-ink-muted/60', 'Cancelled'],
  // bookings
  BOOKED: ['bg-butter-soft text-butter-deep', 'bg-butter', 'Booked'],
  CHECKED_IN: ['bg-sage-soft text-sage-deep', 'bg-sage', 'Checked in'],
  NO_SHOW: ['bg-rose-soft text-rose-deep', 'bg-rose', 'Missed'],
};

export default function StatusBadge({ status, size = 'sm' }) {
  const [cls, dot, label] = STYLES[status] || ['bg-ink/5 text-ink', 'bg-ink-muted', status];
  const sz = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${sz} ${cls}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
