/** The Waitwell mark: you (the cream circle) with your turn coming up (the butter dot). */
import { PRODUCT_NAME } from '../../lib/brand';

export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="18" fill="#557A66" />
      <circle cx="30" cy="34" r="13" fill="#FFFDF9" />
      <circle cx="45" cy="19" r="7" fill="#F1D78C" />
    </svg>
  );
}

export default function BrandMark({ size = 'md', sub }) {
  const big = size === 'lg';
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={big ? 40 : 32} className="shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className={`block font-serif font-medium lowercase ${big ? 'text-3xl' : 'text-2xl'}`} style={{ fontVariationSettings: "'SOFT' 100" }}>
          {PRODUCT_NAME.toLowerCase()}
        </span>
        {sub && <span className="block truncate text-xs font-medium text-ink-muted">{sub}</span>}
      </span>
    </span>
  );
}
