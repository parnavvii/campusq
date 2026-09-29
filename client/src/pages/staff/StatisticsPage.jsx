import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import { ServiceAPI } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';

function Big({ label, value, unit, note }) {
  return (
    <div className="card p-6">
      <dt className="text-sm font-medium text-ink-muted">{label}</dt>
      <dd className="token-numerals mt-1 text-6xl">
        {value ?? '—'}
        {unit && value !== null && value !== undefined && <span className="ml-1 font-sans text-base font-semibold">{unit}</span>}
      </dd>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

const SEGMENTS = [
  ['served', 'Served', 'bg-sage'],
  ['waiting', 'Waiting', 'bg-butter'],
  ['serving', 'Being served', 'bg-apricot'],
  ['skipped', 'Skipped', 'bg-rose'],
  ['cancelled', 'Cancelled', 'bg-ink/20'],
];

export default function StatisticsPage() {
  const serviceId = Number(useParams().id);
  const { data, loading, error } = useLiveData(() => ServiceAPI.statistics(serviceId), {
    events: ['queue:updated'],
    rooms: [serviceId],
    filter: (p) => p.serviceId === serviceId,
    deps: [serviceId],
  });

  if (loading) return <Spinner />;
  if (error) return <Alert tone="error">{error}</Alert>;

  const { service, totals, today, servedOverTime } = data;
  const chartData = servedOverTime.map((d) => ({
    ...d,
    label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
  }));

  return (
    <>
      <PageHeader
        back={<Link to={`/staff/services/${serviceId}`} className="mb-3 inline-block text-sm font-semibold text-ink-muted hover:text-ink">Back to queue</Link>}
        title={`${service.name} statistics`}
        description="All-time totals for this service. Updates live as tokens are called, skipped and cancelled."
        actions={<Link to={`/staff/reports?serviceId=${serviceId}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-cream px-5 font-semibold hover:bg-white">Daily report</Link>}
      />

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Big label="Tokens generated" value={totals.totalTokens} note={`${today.issued} today`} />
        <Big label="Customers served" value={totals.served} note={`${today.served} today`} />
        <Big label="Waiting now" value={totals.waiting} note={service.currentToken ? `Serving ${service.currentToken}` : 'No one at counter'} />
        <Big label="Cancelled" value={totals.cancelled} note={`${totals.skipped} skipped`} />
        <Big label="Average wait" value={totals.avgWaitMinutes} unit="min" note={`${totals.avgServiceMinutes} min per customer`} />
      </dl>

      <section aria-labelledby="outcomes" className="mt-6 card p-5">
        <h2 id="outcomes" className="font-serif text-xl">Token outcomes</h2>
        <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-paper" role="img" aria-label="Share of tokens by status">
          {SEGMENTS.map(([key, , cls]) =>
            totals[key] ? <div key={key} className={cls} style={{ width: `${(totals[key] / Math.max(totals.totalTokens, 1)) * 100}%` }} /> : null
          )}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {SEGMENTS.map(([key, label, cls]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} aria-hidden="true" />
              {label}: <strong>{totals[key]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="served-chart" className="mt-6 card p-5">
        <h2 id="served-chart" className="font-serif text-xl">Customers served, last 7 days</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="#EBE3D8" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#80766D', fontSize: 13 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#80766D', fontSize: 13 }} />
              <Tooltip cursor={{ fill: 'rgba(85,122,102,0.08)' }} formatter={(v) => [v, 'Served']} />
              <Bar dataKey="served" fill="#3D5B4B" radius={[8, 8, 8, 8]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}
