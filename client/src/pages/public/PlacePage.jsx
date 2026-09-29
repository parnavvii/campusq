/** One business: its services with live waits, and join / book for each. Open to everyone. */
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import ServiceList from '../../components/queue/ServiceList';
import ServiceActions from '../../components/queue/ServiceActions';
import TokenCard from '../../components/queue/TokenCard';
import { useAuth } from '../../context/AuthContext';
import { useBusinessPage, useEntryMap, useMyBookings, useMyEntries, useQueueActions } from '../../hooks/useCustomerQueue';
import { CATEGORIES } from '../../lib/brand';
import { setDisplayTimeZone } from '../../lib/format';

function CustomerExtras({ businessId, children }) {
  // Only customers have tokens and bookings to show.
  const mine = useMyEntries();
  const bookings = useMyBookings();
  const here = (mine.data || []).filter((e) => e.business?.id === businessId);
  return children({ mine, bookings, here });
}

export default function PlacePage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const page = useBusinessPage(slug);
  const business = page.data?.business;

  useEffect(() => {
    if (business) setDisplayTimeZone(business.timezone);
  }, [business]);

  if (page.loading) return <Spinner />;
  if (page.error) return <Alert tone="error">{page.error}</Alert>;

  const cat = CATEGORIES[business.category] || CATEGORIES.OTHER;

  const header = (
    <header className="mb-10">
      <Link to="/explore" className="text-sm font-semibold text-ink-muted hover:text-ink">← All places</Link>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            <span className={`h-2.5 w-2.5 rounded-full ${cat.dot}`} aria-hidden="true" />
            {cat.short}
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{business.name}</h1>
          {business.tagline && <p className="mt-2 text-lg text-ink-soft">{business.tagline}</p>}
          {business.address && <p className="mt-1 text-ink-muted">{business.address}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to={`/p/${slug}/track`} className="chip border border-line bg-cream px-4 py-2 text-ink-soft hover:bg-white">Track a walk-in token</Link>
          <a href={`/p/${slug}/board`} target="_blank" rel="noreferrer" className="chip border border-line bg-cream px-4 py-2 text-ink-soft hover:bg-white">
            Waiting-room screen ↗
          </a>
        </div>
      </div>
    </header>
  );

  const list = (renderAction) => (
    <section aria-labelledby="services-heading">
      <h2 id="services-heading" className="mb-4 text-2xl">Services</h2>
      <ServiceList services={page.data.services} emptyText="This place hasn't added any services yet." renderAction={renderAction} />
    </section>
  );

  if (user?.role !== 'CUSTOMER') {
    return (
      <>
        {header}
        {!user && (
          <Alert tone="info" className="mb-6">
            <Link to={`/login?next=/p/${slug}`} className="link">Log in</Link> or <Link to="/register" className="link">create a free account</Link> to join the queue or book a time.
          </Alert>
        )}
        {list((s) => <ServiceActions service={s} businessSlug={slug} />)}
      </>
    );
  }

  return (
    <CustomerExtras businessId={business.id}>
      {({ mine, bookings, here }) => (
        <CustomerPlace page={page} header={header} list={list} mine={mine} bookings={bookings} here={here} slug={slug} />
      )}
    </CustomerExtras>
  );
}

function CustomerPlace({ page, header, list, mine, bookings, here, slug }) {
  const actions = useQueueActions({ onChanged: () => { mine.reload(); page.reload(); } });
  const entryMap = useEntryMap(mine.data);
  const bookingMap = useEntryMap(bookings.data?.upcoming);
  return (
    <>
      {header}
      {here.length > 0 && (
        <section aria-labelledby="here-heading" className="mb-10 space-y-4">
          <h2 id="here-heading" className="text-2xl">You're in line here</h2>
          {here.map((e) => (
            <TokenCard key={e.id} entry={e} compact />
          ))}
        </section>
      )}
      {list((s) => (
        <ServiceActions service={s} businessSlug={slug} entry={entryMap[s.id]} booking={bookingMap[s.id]} joiningId={actions.joiningId} onJoin={actions.join} />
      ))}
    </>
  );
}
