/**
 * Waiting-room screen for one business (open it full-screen on a TV). No login
 * and no names — just what each service is serving now and who is next.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PublicAPI } from '../../lib/api';
import { minutesLabel } from '../../lib/format';
import { LogoMark } from '../../components/layout/BrandMark';
import { PRODUCT_NAME } from '../../lib/brand';

const REFRESH_MS = 5000;

function Clock({ timeZone }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="token-numerals text-5xl">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone })}</span>;
}

export default function DisplayBoardPage() {
  const { slug } = useParams();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      PublicAPI.board(slug)
        .then((b) => {
          if (!alive) return;
          setBoard(b);
          setError(false);
        })
        .catch(() => alive && setError(true));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug]);

  const b = board?.business;
  const host = window.location.host;

  return (
    <div className="flex min-h-screen flex-col bg-sage-deep p-6 text-cream sm:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl text-cream sm:text-5xl">{b?.name || ' '}</h1>
          {b?.tagline && <p className="mt-1 text-lg text-cream/70">{b.tagline}</p>}
        </div>
        <div className="text-right">
          <Clock timeZone={b?.timezone} />
          <p className={`text-sm ${error ? 'text-apricot' : 'text-cream/60'}`}>{error ? 'Reconnecting…' : 'Updates by itself'}</p>
        </div>
      </header>

      <main className="mt-10 grid flex-1 content-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {(board?.services || []).map((s) => (
          <section key={s.id} aria-label={s.name} className="rounded-4xl bg-cream/[0.07] p-7 ring-1 ring-cream/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-2xl text-cream">{s.name}</h2>
                <p className="truncate text-cream/65">{s.location}</p>
              </div>
              {s.status === 'PAUSED' && <span className="shrink-0 rounded-full bg-butter px-3 py-1 text-sm font-semibold text-ink">Short break</span>}
            </div>
            <p className="mt-6 text-sm font-medium text-cream/60">Now serving</p>
            <p key={s.currentToken || 'none'} className="flip-in token-numerals text-8xl text-butter">{s.currentToken || '—'}</p>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-cream/10 pt-5">
              <div>
                <p className="text-sm text-cream/60">Up next</p>
                <p className="token-numerals text-3xl">{s.nextTokens.length ? s.nextTokens.join('   ') : '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-cream/60">{s.queueLength} waiting</p>
                <p className="font-semibold">{s.status !== 'ACTIVE' ? '' : s.estimatedWaitMinutes > 0 ? `about ${minutesLabel(s.estimatedWaitMinutes)}` : 'no wait'}</p>
              </div>
            </div>
          </section>
        ))}
      </main>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 text-cream/75">
        <p className="text-lg">
          Walked in? Follow your token at <strong className="text-cream">{host}/p/{slug}/track</strong>
        </p>
        <p className="flex items-center gap-2 text-sm text-cream/50">
          <LogoMark size={22} /> {PRODUCT_NAME}
        </p>
      </footer>
    </div>
  );
}
