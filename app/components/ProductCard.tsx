import Link from 'next/link';
import type { CatalogItem } from '@/lib/catalog';
import { formatPrice } from '@/lib/catalog';
import { Icon } from './Icon';
import { BuyButton } from './BuyButton';
import { PreviewThumb } from './PreviewGallery';

export function ProductCard({ item }: { item: CatalogItem }) {
  const isBundle = item.type === 'bundle';

  return (
    <article className={`card${isBundle ? ' card--wide' : ''}`}>
      {item.badge && <span className="card__badge">{item.badge}</span>}

      <Link href={`/products/${item.sku}`} className="card__preview-link" tabIndex={-1} aria-hidden="true">
        <PreviewThumb sku={item.sku} name={item.name} />
      </Link>

      <div className="card__icon" style={{ background: item.accent }}>
        <Icon name={item.icon} size={20} />
      </div>

      <h3>
        <Link href={`/products/${item.sku}`}>{item.name}</Link>
      </h3>

      <p className="card__meta">
        {item.pageCount} pages · A4 &amp; US Letter · instant download
      </p>

      <p className="card__blurb">{item.blurb}</p>

      <div className="card__foot">
        <span className="price">
          {formatPrice(item.priceMinor, item.currency)}
          {isBundle && item.savingMinor ? (
            <small>save {formatPrice(item.savingMinor, item.currency)}</small>
          ) : null}
        </span>
        <BuyButton sku={item.sku} label="Buy" variant={isBundle ? 'primary' : 'ghost'} />
      </div>
    </article>
  );
}
