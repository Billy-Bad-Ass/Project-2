import type { Metadata } from 'next';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { merchant } from '@/lib/catalog';
import { metadataBaseUrl } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl()),
  title: {
    default: `${merchant.name} — ${merchant.tagline}`,
    template: `%s — ${merchant.name}`,
  },
  description: merchant.tagline,
  // www.bbanetwork.org is attached to the same Worker rather than redirected, so
  // both hostnames serve the identical page. This tells search engines which one
  // is the real address instead of leaving them to split the ranking.
  alternates: { canonical: './' },
  openGraph: {
    type: 'website',
    siteName: merchant.name,
    title: `${merchant.name} — ${merchant.tagline}`,
    description: merchant.tagline,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
