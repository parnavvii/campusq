/**
 * Daily service statistics: pick a date (and optionally one service) and see
 * the day's totals, how customers arrived, bookings and no-shows, an
 * hour-by-hour chart, a per-service breakdown and a 7-day trend. Days and hours
 * are in the centre's local time. Downloadable as CSV.
 */
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { ReportAPI } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';
import { useAuth } from '../../context/AuthContext';
import { addDays, todayIn, dateStringLabel } from '../../lib/format';

const AXIS = { tickLine: false, axisLine: false, tick: { fill: '#80766D', fontSize: 12 } };

function Stat({ label, value, unit, note }) {
  return (
    <div className="card p-6">
      <dt className="text-sm font-medium text-ink-muted">{label}</dt>
      <dd className="token-numerals mt-1 text-5xl">
        {value ?? '—'}
        {unit && value !== null && value !== undefined && <span className="ml-1 font-sans text-base font-semibold">{unit}</span>}
      </dd>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

function toCsv(report, businessName) {
  const rows = [
    [`${businessName} — daily report`, report.date, `timezone ${report.timezone}`],
    [],
    ['Service', 'Tokens issued', 'Served', 'Cancelled', 'Skipped', 'Joined online', 'Walk-ins', 'Booked', 'Avg wait (min)', 'Avg service (min)', 'Bookings', 'Checked in', 'No-shows'],
    ...[...report.byService, { name: 'All services', ...report.totals }].map((s) => [
      s.name, s.issued, s.served, s.cancelled, s.skipped, s.online, s.walkIn, s.booked, s.avgWaitMinutes ?? '', s.avgServiceMinutes ?? '',
      s.bookings.total, s.bookings.checkedIn, s.bookings.noShow,
    ]),
    [],
    ['Hour', 'Tokens issued', 'Served', 'Avg wait (min)'],
    ...report.hourly.map((h) => [h.label, h.issued, h.served, h.avgWaitMinutes ?? '']),
  ];
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export default function ReportsPage() {
  const { user } = useAuth();
  const businessName = user.business?.name || "Your business";
  const [params, setParams] = useSearchParams();
  const today = todayIn(user.business?.timezone);
  const date = params.get('date') || today;
  const serviceId = params.get('serviceId') || '';
  const report = useLiveData(() => ReportAPI.daily({ date, serviceId: serviceId || undefined }), {
    events: date === today ? ['services:changed'] : [],
    jitterMs: 2000,
    deps: [date, serviceId],
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const download = () => {
    const blob = new Blob([toCsv(report.data, businessName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `daily-report-${report.data.date}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const r = report.data;
  const t = r?.totals;

  return (
    <>
      <PageHeader
        title="Daily report"
        description={`${businessName} · ${dateStringLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${date === today ? ' (today, updating live)' : ''}`}
        actions={r && <Button variant="outline" onClick={download}>Download CSV</Button>}
      />

      <form className="card mb-6 flex flex-wrap items-end gap-3 p-5" onSubmit={(e) => e.preventDefault()}>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" aria-label="Previous day" onClick={() => setParam('date', addDays(date, -1))}>←</Button>
          <div>
            <label htmlFor="report-date" className="mb-1 block text-sm font-semibold">Date</label>
            <input id="report-date" type="date" className="input py-1.5" value={date} max={today} onChange={(e) => e.target.value && setParam('date', e.target.value)} />
          </div>
          <Button variant="outline" size="sm" aria-label="Next day" disabled={date >= today} onClick={() => setParam('date', addDays(date, 1))}>→</Button>
          {date !== today && <Button variant="ghost" size="sm" onClick={() => setParam('date', '')}>Today</Button>}
        </div>
        <div className="min-w-[14rem]">
          <label htmlFor="report-service" className="mb-1 block text-sm font-semibold">Service</label>
          <select id="report-service" className="input py-1.5" value={serviceId} onChange={(e) => setParam('serviceId', e.target.value)}>
            <option value="">All {r ? `${r.services.length} ` : ''}services</option>
            {(r?.services || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </form>

      {report.loading ? (
        <Spinner />
      ) : report.error ? (
        <Alert tone="error">{report.error}</Alert>
      ) : !r.services.length ? (
        <EmptyState title="Nothing to report yet">Once your services have visitors, their day shows up here.</EmptyState>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Tokens issued" value={t.issued} note={`${t.online} online · ${t.walkIn} walk-in · ${t.booked} booked`} />
            <Stat label="Customers served" value={t.served} note={t.active ? `${t.active} still in line` : 'Nobody left waiting'} />
            <Stat label="Cancelled / skipped" value={t.cancelled + t.skipped} note={`${t.cancelled} cancelled · ${t.skipped} skipped`} />
            <Stat label="Average wait" value={t.avgWaitMinutes} unit="min" note={t.maxWaitMinutes !== null ? `Longest ${t.maxWaitMinutes} min` : 'No one called yet'} />
            <Stat label="Bookings" value={t.bookings.total} note={`${t.bookings.checkedIn} checked in · ${t.bookings.noShow} missed${t.bookings.upcoming ? ` · ${t.bookings.upcoming} to come` : ''}`} />
          </dl>

          <section aria-labelledby="hourly" className="card mt-6 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="hourly" className="font-serif text-xl">Hour by hour</h2>
              {r.busiestHour && (
                <p className="text-sm text-ink-muted">
                  Busiest hour: <strong className="text-ink">{r.busiestHour.label}</strong> ({r.busiestHour.issued} tokens) · average service {t.avgServiceMinutes ?? '—'} min
                </p>
              )}
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.hourly} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="#EBE3D8" />
                  <XAxis dataKey="label" {...AXIS} />
                  <YAxis allowDecimals={false} {...AXIS} />
                  <Tooltip cursor={{ fill: 'rgba(85,122,102,0.08)' }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar dataKey="issued" name="Tokens issued" fill="#E39C74" radius={[8, 8, 8, 8]} maxBarSize={28} />
                  <Bar dataKey="served" name="Served" fill="#3D5B4B" radius={[8, 8, 8, 8]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section aria-labelledby="per-service" className="card mt-6 overflow-x-auto">
            <h2 id="per-service" className="border-b border-line px-6 py-4 font-serif text-xl">By service</h2>
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-paper/70 text-ink-muted">
                <tr>
                  {['Service', 'Issued', 'Served', 'Cancelled', 'Skipped', 'Walk-ins', 'Booked', 'Avg wait', 'Avg service', 'No-shows'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.byService.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-semibold">{s.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.issued}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.served}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.cancelled}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.skipped}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.walkIn}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.booked}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.avgWaitMinutes ?? '—'}{s.avgWaitMinutes !== null && ' min'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.avgServiceMinutes ?? '—'}{s.avgServiceMinutes !== null && ' min'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.bookings.noShow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="trend" className="card mt-6 p-6">
            <h2 id="trend" className="font-serif text-xl">Last 7 days</h2>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.trend.map((d) => ({ ...d, label: dateStringLabel(d.date, { weekday: 'short', day: 'numeric' }) }))} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="#EBE3D8" />
                  <XAxis dataKey="label" {...AXIS} />
                  <YAxis allowDecimals={false} {...AXIS} />
                  <Tooltip cursor={{ fill: 'rgba(85,122,102,0.08)' }} />
                  <Bar dataKey="served" name="Served" fill="#3D5B4B" radius={[8, 8, 8, 8]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </>
  );
}
