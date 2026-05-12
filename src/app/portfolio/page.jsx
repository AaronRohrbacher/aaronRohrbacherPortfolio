import { info } from '@/info/Info';

export const metadata = {
  title: 'Portfolio — Software Projects by Aaron Rohrbacher',
  description:
    'Selected software projects by Aaron Rohrbacher: Session (a Rust digital audio workstation), Heard (an AI mastering plugin), Fanboy (a saxophone-tone DAW plugin), AppNow (LLM-powered CRUD app generator), MOVE (open-source macOS window tiler), Klear (KWin transparency script), and more — closed-source and open-source work spanning AI/ML, cross-platform apps, and developer tools.',
  alternates: {
    canonical: '/portfolio',
  },
  openGraph: {
    title: 'Portfolio — Software Projects by Aaron Rohrbacher',
    description:
      'Selected software projects: AI/ML plugins, a Rust DAW, LLM-powered tools, a macOS window tiler, and open-source utilities.',
    url: 'https://aaronrohrbacher.com/portfolio',
    type: 'website',
  },
  twitter: {
    title: 'Portfolio — Software Projects by Aaron Rohrbacher',
    description:
      'Selected software projects: AI/ML plugins, a Rust DAW, LLM tools, a macOS tiler, and OSS utilities.',
  },
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import Portfolio from '@/components/portfolio/Portfolio';

// ItemList of projects so Google can render rich list-style results when
// the portfolio is the matched page. Sourced from the same `info.portfolio`
// the page renders, so the structured data and the visible UI never drift.
const portfolioJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': 'https://aaronrohrbacher.com/portfolio#collectionpage',
  url: 'https://aaronrohrbacher.com/portfolio',
  name: 'Portfolio — Software Projects by Aaron Rohrbacher',
  isPartOf: { '@id': 'https://aaronrohrbacher.com/#website' },
  about: { '@id': 'https://aaronrohrbacher.com/#person' },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://aaronrohrbacher.com' },
      { '@type': 'ListItem', position: 2, name: 'Portfolio', item: 'https://aaronrohrbacher.com/portfolio' },
    ],
  },
  mainEntity: {
    '@type': 'ItemList',
    name: 'Selected projects',
    numberOfItems: info.portfolio.length,
    itemListElement: info.portfolio.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'CreativeWork',
        name: p.title,
        description: p.desc,
        ...(p.source ? { codeRepository: p.source } : {}),
        ...(p.website ? { url: p.website } : {}),
        author: { '@id': 'https://aaronrohrbacher.com/#person' },
      },
    })),
  },
};

export default async function PortfolioPage() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="portfolio" initialDark={initialDark}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioJsonLd) }}
      />
      <Portfolio />
    </BaseLayout>
  );
}
