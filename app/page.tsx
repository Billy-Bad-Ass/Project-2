import { items, listed, bundles, merchant } from '@/lib/catalog';
import { ProductCard } from './components/ProductCard';
import { Icon } from './components/Icon';

export default function HomePage() {
  const forSale = listed.filter((item) => item.type === 'single');
  const totalPages = forSale.reduce((sum, item) => sum + item.pageCount, 0);

  return (
    <>
      <section className="wrap hero">
        <span className="hero__eyebrow">
          <Icon name="bolt" size={12} />
          Instant download
        </span>

        <h1>Reference guides that actually fix the problem.</h1>

        <p className="hero__lede">
          Printable PDFs for the moment you are stuck mid-task — a shot that tastes
          wrong, a board that sounds hollow, an army that needs painting this week.
          Written to be pinned up next to the thing they are about.
        </p>

        <ul className="hero__points">
          <li><Icon name="check" size={14} /> A4 and US Letter, same content</li>
          <li><Icon name="check" size={14} /> {totalPages} pages across {forSale.length} guides</li>
          <li><Icon name="check" size={14} /> Yours to print as often as you like</li>
        </ul>
      </section>

      <section className="wrap" id="guides">
        <div className="section-head">
          <h2>The guides</h2>
          <p>Every guide ships as two PDFs — no physical item.</p>
        </div>

        <div className="grid grid--3">
          {forSale.map((item) => (
            <ProductCard key={item.sku} item={item} />
          ))}
        </div>

        {bundles.length > 0 && (
          <div className="grid" style={{ marginTop: 20 }}>
            {bundles.map((item) => (
              <ProductCard key={item.sku} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="wrap">
        <div className="section-head">
          <h2>Why these are different</h2>
        </div>
        <div className="grid grid--3">
          <article className="card">
            <h3>They say what will not work</h3>
            <p className="card__blurb">
              Most guides only tell you what to do. These tell you when a fix will do
              nothing on your setup and why — so you stop chasing a change that was
              never available.
            </p>
          </article>
          <article className="card">
            <h3>Built to be printed</h3>
            <p className="card__blurb">
              High contrast, no background wash, readable at arm&apos;s length under a
              desk lamp. Checked in greyscale, because people print things at work.
            </p>
          </article>
          <article className="card">
            <h3>One page does the work</h3>
            <p className="card__blurb">
              Each guide has a single page that is the product — the card, the chart,
              the recipes. The rest exists to stop that page being misread.
            </p>
          </article>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 24 }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Questions before buying? <a href={`mailto:${merchant.supportEmail}`}>{merchant.supportEmail}</a>
          {' · '}
          {forSale.length} {forSale.length === 1 ? 'guide' : 'guides'} available.
        </p>
      </section>
    </>
  );
}
