/** Every business on Waitwell — search by name or filter by kind of place. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import BusinessCard from '../../components/business/BusinessCard';
import { BusinessAPI } from '../../lib/api';
import { useLiveData } from '../../hooks/useLiveData';
import { CATEGORIES } from '../../lib/brand';

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const [query, setQuery] = useState(params.get('q') || '');
  const [q, setQ] = useState(query);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const list = useLiveData(() => BusinessAPI.list({ q: q || undefined, category: category || undefined }), {
    deps: [q, category],
    pollMs: 30000,
  });

  const setCategory = (key) => {
    const next = new URLSearchParams(params);
    if (key) next.set('category', key);
    else next.delete('category');
    setParams(next, { replace: true });
  };

  const chip = (active) =>
    `chip px-4 py-2 transition-colors ${active ? 'bg-sage-deep text-cream' : 'border border-line bg-cream text-ink-soft hover:bg-white'}`;

  return (
    <>
      <PageHeader eyebrow="Find a place" title="Where are you headed?" description="See how busy each place is right now, then join the queue or book a time." />

      <form role="search" className="mb-5 max-w-xl" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="place-search" className="sr-only">Search places</label>
        <input
          id="place-search"
          type="search"
          className="input rounded-full px-5"
          placeholder="Search by name, service or area"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Kind of place">
        <button type="button" aria-pressed={!category} className={chip(!category)} onClick={() => setCategory('')}>All</button>
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <button key={key} type="button" aria-pressed={category === key} className={chip(category === key)} onClick={() => setCategory(key)}>
            <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
            {c.label}
          </button>
        ))}
      </div>

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <Alert tone="error">{list.error}</Alert>
      ) : !list.data.length ? (
        <EmptyState title="No places match that yet">Try another search, or pick a different kind of place.</EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((b) => (
            <BusinessCard key={b.id} business={b} />
          ))}
        </div>
      )}
    </>
  );
}
