export const metadata = {
  title: 'Contact Aaron Rohrbacher',
  description:
    'Get in touch with Aaron Rohrbacher — Lead Cross-Platform Software and DevOps Engineer in Portland, Oregon. Available immediately for senior, lead, and architect roles. Reach out via the on-site AI assistant for chat, voice, or video, or for direct email.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact Aaron Rohrbacher',
    description:
      'Open to new opportunities — chat, voice, video, or email. Lead Software & DevOps Engineer, Portland, Oregon.',
    url: 'https://aaronrohrbacher.com/contact',
    type: 'website',
  },
  twitter: {
    title: 'Contact Aaron Rohrbacher',
    description: 'Open to new opportunities. Lead Software & DevOps Engineer · Portland, OR.',
  },
};

import BaseLayout from '@/components/BaseLayout';
import ContactPage from '@/components/contact/ContactPage';

export const dynamic = 'force-static';

const contactJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': 'https://aaronrohrbacher.com/contact#contactpage',
  url: 'https://aaronrohrbacher.com/contact',
  name: 'Contact Aaron Rohrbacher',
  description: 'Contact page for Aaron Rohrbacher.',
  isPartOf: { '@id': 'https://aaronrohrbacher.com/#website' },
  about: { '@id': 'https://aaronrohrbacher.com/#person' },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://aaronrohrbacher.com' },
      { '@type': 'ListItem', position: 2, name: 'Contact', item: 'https://aaronrohrbacher.com/contact' },
    ],
  },
};

export default function Contact() {
  return (
    <BaseLayout activePage="contact">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />
      <ContactPage />
    </BaseLayout>
  );
}
