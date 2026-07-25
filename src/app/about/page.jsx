export const metadata = {
  title: 'About',
  description:
    'About Aaron Rohrbacher — a Portland, Oregon Lead AI/ML Software Engineer and DevOps Architect. Background in cross-platform app development (iOS, Android, macOS, Windows, Linux), enterprise cloud migrations, custom LLM fine-tuning, and conversational AI. AWS Certified Cloud Practitioner and Developer – Associate.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About | Aaron Rohrbacher',
    description:
      'Lead AI/ML Software Engineer & DevOps Architect in Portland, Oregon. Multi-cloud (AWS / GCP / Azure), native cross-platform apps, LLM fine-tuning, and conversational AI.',
    url: 'https://aaronrohrbacher.com/about',
    type: 'profile',
  },
  twitter: {
    title: 'About | Aaron Rohrbacher',
    description:
      'Lead AI/ML Software Engineer & DevOps Architect in Portland, Oregon.',
  },
};

import BaseLayout from '@/components/BaseLayout';
import About from '@/components/about/About';

export const dynamic = 'force-static';

const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  '@id': 'https://aaronrohrbacher.com/about#profilepage',
  url: 'https://aaronrohrbacher.com/about',
  name: 'About | Aaron Rohrbacher',
  description:
    'About Aaron Rohrbacher — Lead AI/ML Software Engineer and DevOps Architect based in Portland, Oregon.',
  mainEntity: { '@id': 'https://aaronrohrbacher.com/#person' },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://aaronrohrbacher.com' },
      { '@type': 'ListItem', position: 2, name: 'About', item: 'https://aaronrohrbacher.com/about' },
    ],
  },
};

export default function AboutPage() {
  return (
    <BaseLayout activePage="about">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />
      <About />
    </BaseLayout>
  );
}
