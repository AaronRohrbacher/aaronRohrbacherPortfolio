import PortaputerLayout from '@/components/portaputer/PortaputerLayout';

export const metadata = {
  title: {
    default: 'PortaPuter — Your Entire PC in a Single File',
    template: '%s | PortaPuter',
  },
  description:
    'Capture a live Windows desktop into one portable executable. Double-click to launch it anywhere — no installation, no hypervisor, no fuss. Free and open source.',
  keywords: [
    'portable VM', 'Windows imaging', 'QEMU', 'virtual machine',
    'disk imaging', 'portable desktop', 'PC backup', 'system capture',
    'open source', 'VSS snapshot',
  ],
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com',
  },
  openGraph: {
    title: 'PortaPuter — Your Entire PC in a Single File',
    description:
      'Capture a live Windows desktop into one portable executable. Double-click to launch it anywhere.',
    url: 'https://portaputer.aaronrohrbacher.com',
    siteName: 'PortaPuter',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PortaPuter — Your Entire PC in a Single File',
    description:
      'Capture a live Windows desktop into one portable executable. Free and open source.',
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
