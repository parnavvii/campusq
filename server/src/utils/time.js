/**
 * Timezone helpers. MySQL stores every timestamp in UTC; the service centre
 * thinks in its own local time (settings.timezone, e.g. "Asia/Kolkata").
 * These helpers convert between the two using the built-in Intl API.
 */

const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return partsCache.get(tz);
}

/** Wall-clock parts of an instant in `tz`. */
function localParts(date, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** Minutes to add to UTC to get local time in `tz` at that instant (e.g. +330 for India). */
function offsetMinutes(date, tz) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Local date "YYYY-MM-DD" + minutes since local midnight → the UTC instant. */
function zonedToUtc(dateStr, minutes, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = offsetMinutes(new Date(guess), tz);
  let utc = guess - first * 60000;
  const second = offsetMinutes(new Date(utc), tz);
  if (second !== first) utc = guess - second * 60000; // crossed a DST change
  return new Date(utc);
}

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" of an instant in `tz`. */
function localDate(date, tz) {
  const p = localParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight of an instant in `tz`. */
function localMinutes(date, tz) {
  const p = localParts(date, tz);
  return p.hour * 60 + p.minute;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** [start, end) of a local calendar day, as UTC instants. */
function dayRange(dateStr, tz) {
  return { start: zonedToUtc(dateStr, 0, tz), end: zonedToUtc(addDays(dateStr, 1), 0, tz) };
}

/** "09:30" / "09:30:00" → 570. "24:00" is allowed as an end-of-day closing time. */
function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

module.exports = {
  localParts,
  offsetMinutes,
  zonedToUtc,
  localDate,
  localMinutes,
  addDays,
  dayRange,
  timeToMinutes,
  minutesToTime,
  isValidTimeZone,
  isValidDateString,
};
