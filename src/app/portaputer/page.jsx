import PortaputerPage from '@/components/portaputer/PortaputerPage';

export const dynamic = 'force-static';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PortaPuter',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Windows 10, Windows 11',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description:
    'Capture a live Windows desktop into a portable package that launches with one double-click.',
  author: {
    '@type': 'Person',
    name: 'Aaron Rohrbacher',
    url: 'https://aaronrohrbacher.com',
  },
  softwareVersion: '0.1',
  license: 'https://opensource.org/licenses/MIT',
  url: 'https://portaputer.aaronrohrbacher.com',
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PortaputerPage />
    </>
  );
}
