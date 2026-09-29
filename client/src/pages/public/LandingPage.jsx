/** The front door: what Waitwell is, for people waiting and for the places they wait at. */
import { Link, Navigate } from 'react-router-dom';
import QueueDots from '../../components/queue/QueueDots';
import { LogoMark } from '../../components/layout/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES, PRODUCT_NAME } from '../../lib/brand';
import { homeForRole } from '../../lib/format';

const primary = 'inline-flex min-h-12 items-center rounded-full bg-sage-deep px-6 font-semibold text-cream hover:bg-sage';
const secondary = 'inline-flex min-h-12 items-center rounded-full border border-line bg-cream px-6 font-semibold text-ink hover:bg-white';

function HeroPicture() {
  return (
    <div className="relative mx-auto h-[26rem] w-full max-w-md" aria-hidden="true">
      <div className="absolute left-6 top-4 h-72 w-72 rounded-full bg-sage-soft" />
      <div className="absolute bottom-6 right-2 h-44 w-44 rounded-full bg-apricot-soft" />
      <div className="absolute right-10 top-0 h-16 w-16 rounded-full bg-butter-soft" />

      <div className="card absolute left-0 right-8 top-16 -rotate-2 p-6 shadow-lift">
        <p className="text-sm font-semibold text-sage-deep">Glow &amp; Go Salon</p>
        <p className="font-serif text-lg">Haircut &amp; Styling</p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs text-ink-muted">Your token</p>
            <p className="token-numerals text-6xl text-sage-deep">H024</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-muted">About</p>
            <p className="token-numerals text-3xl">
              35<span className="ml-1 font-sans text-xs font-semibold text-ink-muted">min</span>
            </p>
          </div>
        </div>
        <div className="mt-4">
          <QueueDots ahead={3} />
        </div>
      </div>

      <div className="absolute bottom-10 left-10 flex items-center gap-3 rounded-2xl bg-butter-soft px-4 py-3 shadow-soft">
        <span className="h-2.5 w-2.5 rounded-full bg-butter" />
        <p className="text-sm font-semibold">You're next — head over to Chair 2</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeForRole(user.role)} replace />;

  return (
    <>
      <section className="grid items-center gap-10 pb-8 lg:grid-cols-[1.1fr_1fr] lg:py-8">
        <div>
          <p className="eyebrow">For salons, clinics, repair shops, offices — any place with a line</p>
          <h1 className="mt-4 text-5xl leading-[1.05] sm:text-6xl">Wait for your turn somewhere nicer.</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">
            Join a queue from your phone or book a time. See how many people are ahead of you, and come back when you're nearly up.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/explore" className={primary}>Find a place</Link>
            <Link to="/business/new" className={secondary}>List your business</Link>
          </div>
          <p className="mt-5 text-sm text-ink-muted">Free for customers. Nothing to install — it works in your browser.</p>
        </div>
        <HeroPicture />
      </section>

      <section aria-labelledby="how" className="py-12">
        <h2 id="how" className="text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {[
            ['Pick a place', 'Salons, clinics, repair shops, offices, help desks — if it has a line, it can be here.'],
            ['Join or book', "Take a token for right now, or book a time for later. You'll see the wait before you decide."],
            ["Come back when it's time", "Your place updates as the line moves. We'll tell you when you're next and when it's your turn."],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-4">
              <span className="font-serif text-5xl leading-none text-sage/60">{i + 1}</span>
              <div>
                <h3 className="font-serif text-xl">{title}</h3>
                <p className="mt-1 text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="kinds" className="py-8">
        <h2 id="kinds" className="text-3xl">Browse by kind of place</h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <Link key={key} to={`/explore?category=${key}`} className="chip border border-line bg-cream px-4 py-2 text-ink-soft hover:bg-white">
              <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden="true" />
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="business" className="my-12 grid gap-8 rounded-4xl bg-sage-tint p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="eyebrow">For businesses</p>
          <h2 id="business" className="mt-2 text-4xl">Run your line from one screen.</h2>
          <p className="mt-4 max-w-xl text-ink-soft">
            Whether you cut hair, fix phones or issue certificates, {PRODUCT_NAME} gives your team a calm way to handle walk-ins and bookings together.
          </p>
          <ul className="mt-6 space-y-2.5 text-ink-soft">
            {[
              'Call the next person with one tap — they get a nudge on their phone',
              "Add walk-ins who don't have the app",
              'Take bookings, and check people in when they arrive',
              'See who came, how long they waited and your busiest hour, every day',
              'Show the queue on a screen in your waiting room',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-4 rounded-3xl bg-cream p-8 shadow-soft">
          <LogoMark size={44} />
          <p className="font-serif text-2xl">Set up your business in a couple of minutes.</p>
          <p className="text-ink-muted">Add your services and opening hours, invite your team, and share your page with customers.</p>
          <Link to="/business/new" className={`${primary} self-start`}>Get started — it's free</Link>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-ink-muted">
        <p>{PRODUCT_NAME} · for places with a line</p>
        <p className="flex gap-4">
          <Link to="/explore" className="hover:text-ink">Find a place</Link>
          <Link to="/login" className="hover:text-ink">Log in</Link>
          <Link to="/business/new" className="hover:text-ink">For businesses</Link>
        </p>
      </footer>
    </>
  );
}
