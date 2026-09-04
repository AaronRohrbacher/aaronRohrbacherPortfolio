import { absoluteSeoTitle, SEO_HOME_TITLES } from '@/lib/seoTitles';

// Use `title.absolute` so the homepage renders the full marketing title
// without the layout's "%s | Aaron Rohrbacher" template appending the suffix.
export const metadata = {
  title: absoluteSeoTitle(SEO_HOME_TITLES.main),
  description:
    'Aaron Rohrbacher — Lead Cross-Platform Software and DevOps Engineer based in Portland, Oregon. Building AI/ML systems with PyTorch and LLM fine-tuning, leading cloud architecture on AWS, GCP, and Azure, and shipping native apps for iOS, Android, macOS, Windows, and Linux.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: SEO_HOME_TITLES.main,
    description:
      'Portfolio of Aaron Rohrbacher — Portland, Oregon. AI/ML engineering, full-stack development, multi-cloud architecture, and native cross-platform apps.',
    url: 'https://aaronrohrbacher.com',
    type: 'website',
  },
  twitter: {
    title: SEO_HOME_TITLES.main,
    description:
      'Portfolio of Aaron Rohrbacher — Portland, Oregon. AI/ML, full-stack, multi-cloud, and native apps.',
  },
};

import BaseLayout from '@/components/BaseLayout';
import Home from '@/components/home/Home';

export const dynamic = 'force-static';

// Site-wide JSON-LD: a Person identity + the WebSite they live on. Lives on
// the homepage (Google's canonical entry point) so the knowledge-graph
// signal is unambiguously attached to the root URL. Other pages get their
// own page-type schemas.
const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': 'https://aaronrohrbacher.com/#person',
      name: 'Aaron Rohrbacher',
      url: 'https://aaronrohrbacher.com',
      jobTitle: 'Lead Cross-Platform Software and DevOps Engineer',
      description:
        'Lead AI/ML Software Engineer and DevOps Architect specializing in custom AI model development, conversational AI, and multi-cloud architecture.',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Portland',
        addressRegion: 'OR',
        addressCountry: 'US',
      },
      sameAs: [
        'https://github.com/aaronrohrbacher',
        'https://linkedin.com/in/aaronrohrbacher',
      ],
      knowsAbout: [
        'Artificial Intelligence',
        'Machine Learning',
        'PyTorch',
        'Large Language Models',
        'Conversational AI',
        'Amazon Web Services',
        'Google Cloud Platform',
        'Microsoft Azure',
        'DevOps',
        'Site Reliability Engineering',
        'iOS Development',
        'Android Development',
        'Cross-Platform Development',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://aaronrohrbacher.com/#website',
      url: 'https://aaronrohrbacher.com',
      name: 'Aaron Rohrbacher',
      description:
        'Portfolio of Aaron Rohrbacher — Lead Cross-Platform Software and DevOps Engineer based in Portland, Oregon.',
      publisher: { '@id': 'https://aaronrohrbacher.com/#person' },
      inLanguage: 'en-US',
    },
    {
      '@type': 'WebPage',
      '@id': 'https://aaronrohrbacher.com/#webpage',
      url: 'https://aaronrohrbacher.com',
      name: SEO_HOME_TITLES.main,
      isPartOf: { '@id': 'https://aaronrohrbacher.com/#website' },
      about: { '@id': 'https://aaronrohrbacher.com/#person' },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: 'https://aaronrohrbacher.com/opengraph-image',
      },
    },
  ],
};

export default function HomePage() {
  return (
    <BaseLayout activePage="home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <Home />
    </BaseLayout>
  );
}
