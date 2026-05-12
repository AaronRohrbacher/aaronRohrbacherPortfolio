import { headers } from 'next/headers';
import PortaputerLayout from '@/components/portaputer/PortaputerLayout';

export const metadata = {
  title: {
    default: 'PortaPuter — Your Entire PC, One Double-Click Away',
    template: '%s | PortaPuter',
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
    title: 'PortaPuter — Your Entire PC, One Double-Click Away',
    description:
      'Capture a live Windows desktop into a portable package. Copy it to any PC, double-click to launch.',
    url: 'https://portaputer.aaronrohrbacher.com',
    siteName: 'PortaPuter',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PortaPuter — Your Entire PC, One Double-Click Away',
    description:
      'Capture a live Windows desktop into a portable package. Free and open source.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function PortaputerRootLayout({ children }) {
  const hdrs = await headers();
  const host = hdrs.get('host') || '';
  const isPortaputerSubdomain =
    host.startsWith('portaputer.') || host.startsWith('portaputer-');

  return (
    <PortaputerLayout isPortaputerSubdomain={isPortaputerSubdomain}>
      {children}
    </PortaputerLayout>
  );
}
