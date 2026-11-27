import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = 'https://status.listengeet.com';
const description =
  "Live availability for Geet's web app, shared API, and development site, updated through UptimeRobot.";
const socialImage = '/og/geet-default.jpg';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Geet Status',
  title: 'Geet Status | Live Service Health',
  description,
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  openGraph: {
    title: 'Geet Status | Live Service Health',
    description,
    url: siteUrl,
    siteName: 'Geet Status',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: 'Geet - Music Sounds Better Together',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Geet Status | Live Service Health',
    description,
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050505',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
