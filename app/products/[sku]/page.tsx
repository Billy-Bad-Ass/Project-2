import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, items, isSellable, formatPrice } from '@/lib/catalog';
import { Icon } from '@/app/components/Icon';
import { BuyButton } from '@/app/components/BuyButton';
import { merchant } from '@/lib/catalog';
import { PreviewGallery } from '@/app/components/PreviewGallery';
import { Reviews } from '@/app/components/Reviews';

type Params = { params: Promise<{ sku: string }> };

export function generateStaticParams() {
  return items.map((item) => ({ sku: item.sku }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sku } = await params;
  const item = getItem(sku);
  if (!item) return { title: 'Not found' };

  return {
    title: item.name,
    description: item.blurb,
    keywords: item.tags,
    openGraph: { title: item.listingTitle || item.name, description: item.blurb },
  };
}

export default async function ProductPage({ params }: Params) {
  const { sku } = await params;
  const item = getItem(sku);
  if (!item) notFound();

  const members = item.includes?.map((s) => getItem(s)).filter(Boolean) ?? [];

  return (
    <div className="wrap product">
      <div className="product__body">
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 8 }}>
          <Link href="/#guides" style={{ color: 'var(--muted)' }}>Guides</Link> / {item.name}
        </p>

        <h1>{item.name}</h1>
        {item.subtitle && (
          <p style={{ fontSize: '1.15rem', color: 'var(--muted)' }}>{item.subtitle}</p>
        )}

        <PreviewGallery sku={item.sku} name={item.name} />

        <h2>What you get</h2>
        <div className="product__desc">
          {item.descriptionBlocks.map((block, index) => {
            if (block.type === 'heading') {
              return <h3 key={index} className="desc__heading">{block.text}</h3>;
            }
            if (block.type === 'list') {
              return (
                <ul key={index} className="desc__list">
                  {block.items.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              );
            }
            return <p key={index}>{block.text}</p>;
          })}
        </div>

        {item.pages && item.pages.length > 0 && (
          <>
            <h2>Inside</h2>
            <ul className="pagelist">
              {item.pages.map((page) => (
                <li key={page.number}>
                  <span>p{page.number}</span>
                  <span>{page.heading || '—'}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {members.length > 0 && (
          <>
            <h2>Included guides</h2>
            <ul className="pagelist">
              {members.map((member) => (
                <li key={member!.sku}>
                  <span>{member!.pageCount}p</span>
                  <span>
                    <Link href={`/products/${member!.sku}`}>{member!.name}</Link>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <Reviews reviews={item.reviews} rating={item.rating} productName={item.name} />

        {item.tags.length > 0 && (
          <div className="tags" style={{ marginTop: 28 }}>
            {item.tags.map((tag) => (
              <span className="tag" key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      <aside>
        {!isSellable(item) ? (
          <div className="buybox">
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>Not on sale yet</h2>
            <p style={{ fontSize: '0.93rem', color: 'var(--muted)', margin: 0 }}>
              This guide is still being finished, so it cannot be bought. The listing
              describes content the file does not contain yet, and selling it in that
              state would not be honest.
            </p>
            <p style={{ fontSize: '0.93rem', color: 'var(--muted)', margin: '12px 0 0' }}>
              Want it when it lands?{' '}
              <a href={`mailto:${merchant.supportEmail}?subject=${encodeURIComponent(`Tell me when ${item.name} is ready`)}`}>
                Email us
              </a>{' '}
              and you will be the first told.
            </p>
          </div>
        ) : (
        <div className="buybox">
          <p className="buybox__price" style={{ margin: 0 }}>
            {formatPrice(item.priceMinor, item.currency)}
          </p>
          {item.savingMinor ? (
            <p style={{ color: 'var(--ok)', fontSize: '0.88rem', margin: '4px 0 0' }}>
              Saves {formatPrice(item.savingMinor, item.currency)} against buying separately
            </p>
          ) : null}

          <ul>
            <li><Icon name="check" size={13} /> {item.pageCount}-page PDF, instant download</li>
            <li><Icon name="check" size={13} /> A4 and US Letter — two files, same content</li>
            <li><Icon name="check" size={13} /> Print as many copies as you like, forever</li>
            <li><Icon name="check" size={13} /> No physical item is shipped</li>
          </ul>

          <BuyButton sku={item.sku} label={`Buy for ${formatPrice(item.priceMinor, item.currency)}`} block />

          <p className="buybox__note">
            <Icon name="lock" size={11} /> Secure checkout by Stripe
          </p>
        </div>
        )}

        <div className="buybox" style={{ marginTop: 16, position: 'static' }}>
          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>
            Files
          </h3>
          <ul style={{ margin: 0 }}>
            {item.files.map((file) => (
              <li key={file.name}>
                <Icon name="file-pdf" size={13} /> {file.label}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
