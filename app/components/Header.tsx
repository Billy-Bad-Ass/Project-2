import Link from 'next/link';
import { merchant } from '@/lib/catalog';

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link href="/" className="site-header__logo" aria-label={`${merchant.name} home`}>
          {/* Two real files rather than a CSS filter — see brand/README.md */}
          <picture>
            <source srcSet="/logo-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/logo.svg" alt={merchant.name} width={292} height={72} />
          </picture>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/#guides">Guides</Link>
          <Link href="/about">About</Link>
          <Link href="/licence">Licence</Link>
        </nav>
      </div>
    </header>
  );
}
