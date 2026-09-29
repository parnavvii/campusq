/**
 * Display helpers. Times are shown in the *business's* timezone, not the viewer's —
 * "your slot is at 10:30" must mean 10:30 at the place you're going to.
 * Pass `tz` explicitly when a screen mixes businesses; otherwise the default set
 * by the current screen (setDisplayTimeZone) is used.
 */
let displayTimeZone;

export function setDisplayTimeZone(tz) {
  displayTimeZone = tz || undefined;
}

export function minutesLabel(min) {
  if (min === null || min === undefined) return '—';
  if (min <= 0) return 'no wait';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function timeLabel(value, tz = displayTimeZone) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** "20:00" → "8:00 PM"; "24:00" → "midnight". For opening hours stored as local clock times. */
export function hhmmLabel(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  if (h === 24) return 'midnight';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** { hm: '10:30', period: 'AM' } — for showing the digits large and AM/PM small. */
export function clockParts(value, tz = displayTimeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).formatToParts(new Date(value));
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return { hm: `${get('hour')}:${get('minute')}`, period: get('dayPeriod') };
}

export function dateTimeLabel(value, tz = displayTimeZone) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** "Tue, 30 Sep" for an instant. */
export function dayLabel(value, tz = displayTimeZone) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
}

/** "Tue, 30 Sep" for a calendar date string "YYYY-MM-DD" (no timezone shift). */
export function dateStringLabel(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString([], { ...opts, timeZone: 'UTC' });
}

/** Today's date "YYYY-MM-DD" in a timezone. */
export function todayIn(tz = displayTimeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "today", "tomorrow" or "Tue, 30 Sep" for an instant. */
export function relativeDay(value, tz = displayTimeZone) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const today = todayIn(tz);
  if (d === today) return 'today';
  if (d === addDays(today, 1)) return 'tomorrow';
  return dayLabel(value, tz);
}

export function relativeMinutes(value) {
  if (!value) return '';
  const diff = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diff === 0) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)} h ${diff % 60} min ago`;
}

/** "Good morning" / "Good afternoon" / "Good evening" for the viewer. */
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const homeForRole = (role) => ({ CUSTOMER: '/me', STAFF: '/staff', ADMIN: '/staff' }[role] || '/');
