import PortaputerLayout from '@/components/portaputer/PortaputerLayout';
import { SEO_HOME_TITLES, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  metadataBase: new URL('https://portaputer.aaronrohrbacher.com'),
  title: {
    default: SEO_HOME_TITLES.portaputer,
    template: `%s | ${SEO_SITES.portaputer}`,
  },
  description:
    'Capture a live Windows desktop into a portable package. Copy it to any PC, double-click, and your old desktop boots in a window — no installation, no hypervisor, no fuss. Free and open source.',
  keywords: [
    'portable VM', 'Windows imaging', 'QEMU', 'virtual machine',
    'disk imaging', 'portable desktop', 'PC backup', 'system capture',
    'open source', 'VSS snapshot',
  ],
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com',
  },
  openGraph: {
    title: SEO_HOME_TITLES.portaputer,
    description:
      'Capture a live Windows desktop into a portable package. Copy it to any PC, double-click to launch.',
    url: 'https://portaputer.aaronrohrbacher.com',
    siteName: SEO_SITES.portaputer,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_HOME_TITLES.portaputer,
    description:
      'Capture a live Windows desktop into a portable package. Free and open source.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function PortaputerRootLayout({ children }) {
  return (
    <PortaputerLayout>
      {children}
    </PortaputerLayout>
  );
}
