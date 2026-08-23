import type { Metadata } from 'next';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { merchant } from '@/lib/catalog';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: `${merchant.name} — ${merchant.tagline}`,
    template: `%s — ${merchant.name}`,
  },
  description: merchant.tagline,
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
