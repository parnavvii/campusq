import { Link } from 'react-router-dom';
import BrandMark from '../../components/layout/BrandMark';

export default function AuthLayout({ title, subtitle, children, aside, wide = false }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sage-tint p-12 lg:flex">
        <Link to="/" aria-label="Waitwell home">
          <BrandMark size="lg" />
        </Link>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-sage-soft" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-24 right-40 h-40 w-40 rounded-full bg-apricot-soft" />
        <div aria-hidden="true" className="pointer-events-none absolute right-24 top-28 h-16 w-16 rounded-full bg-butter-soft" />
        <div className="relative">
          {aside || (
            <>
              <p className="max-w-md font-serif text-4xl leading-tight">Your place in line, wherever you are.</p>
              <p className="mt-4 max-w-sm text-ink-soft">Grab a coffee, run an errand, sit in the car. We'll let you know when it's nearly your turn.</p>
            </>
          )}
        </div>
        <p className="relative text-sm text-ink-muted">
          <Link to="/explore" className="hover:text-ink">Find a place</Link>
          <span className="mx-2" aria-hidden="true">·</span>
          <Link to="/business/new" className="hover:text-ink">List your business</Link>
        </p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          <Link to="/" className="mb-10 block lg:hidden" aria-label="Waitwell home">
            <BrandMark />
          </Link>
          <h1 className="text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
