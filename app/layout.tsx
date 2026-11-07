import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'MENFESS — Kirim pesan. Tanpa nama.',
    template: '%s — MENFESS',
  },
  description: 'Kirim menfess anonim ke Twitter. Cepat, tanpa ribet, tanpa nama.',
  applicationName: 'MENFESS',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: '/',
    siteName: 'MENFESS',
    title: 'MENFESS — Kirim pesan. Tanpa nama.',
    description: 'Yang gak bisa lu bilang langsung, bilang di sini. Kami yang posting.',
  },
  twitter: {
    card: 'summary',
    title: 'MENFESS — Kirim pesan. Tanpa nama.',
    description: 'Yang gak bisa lu bilang langsung, bilang di sini. Kami yang posting.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0708',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="font-sans">{children}</body>
    </html>
  );
}
