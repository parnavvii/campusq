/** How someone got in line: joined online, walked in, or booked a time. */
import { timeLabel } from '../../lib/format';

export default function SourceBadge({ source, bookedFor, tz }) {
  if (source === 'BOOKING') {
    return <span className="chip bg-butter-soft px-2 py-0.5 text-xs text-butter-deep">Booked {timeLabel(bookedFor, tz)}</span>;
  }
  if (source === 'WALK_IN') {
    return <span className="chip bg-apricot-soft px-2 py-0.5 text-xs text-apricot-deep">Walk-in</span>;
  }
  return <span className="chip bg-ink/5 px-2 py-0.5 text-xs text-ink-muted">Online</span>;
}
