import Link from 'next/link';
import { merchant, listed } from '@/lib/catalog';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="site-footer__grid">
          <div>
            <div className="site-footer__logo">
              <picture>
                <source srcSet="/logo-dark.svg" media="(prefers-color-scheme: dark)" />
                <img src="/logo.svg" alt={merchant.name} width={292} height={72} />
              </picture>
            </div>
            <p style={{ maxWidth: '34ch' }}>{merchant.tagline}</p>
          </div>

          <div>
            <h4>Guides</h4>
            <ul>
              {listed.map((item) => (
                <li key={item.sku}>
                  <Link href={`/products/${item.sku}`}>{item.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Store</h4>
            <ul>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/licence">Licence &amp; refunds</Link></li>
              <li><a href={`mailto:${merchant.supportEmail}`}>{merchant.supportEmail}</a></li>
            </ul>
          </div>
        </div>

        <div className="site-footer__legal">
          <p style={{ marginBottom: 4 }}>
            © {new Date().getFullYear()} {merchant.name}. Digital downloads — no physical item is shipped.
          </p>
          <p style={{ margin: 0 }}>
            Payments handled by Stripe. Icons by{' '}
            <a href="https://fontawesome.com" rel="noopener noreferrer">Font Awesome</a>{' '}
            (CC BY 4.0).
          </p>
        </div>
      </div>
    </footer>
  );
}
