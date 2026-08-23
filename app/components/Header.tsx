import Link from 'next/link';
import { merchant } from '@/lib/catalog';

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link href="/" className="site-header__logo" aria-label={`${merchant.name} home`}>
          {/* Swap brand/logo.svg and re-copy to public/ — see brand/README.md */}
          <img src="/logo.svg" alt={merchant.name} width={240} height={64} />
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
