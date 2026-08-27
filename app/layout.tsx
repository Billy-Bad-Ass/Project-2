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
  // Resolved against NEXT_PUBLIC_SITE_URL (guides.bbanetwork.org), so every page
  // names itself as the canonical address. The hub forwards the legacy apex URLs
  // here with a 301, which is what moves the search authority rather than
  // splitting it across two hostnames.
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
