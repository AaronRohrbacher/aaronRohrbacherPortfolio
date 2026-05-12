export const metadata = {
  title: 'Resume — Aaron Rohrbacher, Lead Software & DevOps Engineer',
  description:
    'Resume of Aaron Rohrbacher — Lead Cross-Platform Software and DevOps Engineer, Portland, Oregon. Most recently Lead SDE at Forbes AAC stabilizing a critical Ruby/Ember platform and rebuilding native iOS, Android, macOS, Windows, and Linux apps. Prior: Technical Lead at SPARQ on AI conversational experiences and AWS Lambda microservices for a 500k-employee global logistics payroll system. AWS Certified Cloud Practitioner & Developer – Associate.',
  alternates: {
    canonical: '/resume',
  },
  openGraph: {
    title: 'Resume — Aaron Rohrbacher, Lead Software & DevOps Engineer',
    description:
      'Lead Software & DevOps Engineer based in Portland, Oregon. 7+ years across AI/ML, multi-cloud architecture, and native cross-platform development.',
    url: 'https://aaronrohrbacher.com/resume',
    type: 'profile',
  },
  twitter: {
    title: 'Resume — Aaron Rohrbacher',
    description: 'Lead Software & DevOps Engineer · Portland, OR · AI/ML, AWS, native cross-platform.',
  },
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import Resume from '@/components/resume/Resume';

// ProfilePage with a Person hasOccupation timeline. Mirrors the EXPERIENCE
// data in src/components/resume/Resume.jsx — kept in sync manually because
// that file is a client component and pulling its const into a server file
// would prevent tree-shaking. Update both when work history changes.
const resumeJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  '@id': 'https://aaronrohrbacher.com/resume#profilepage',
  url: 'https://aaronrohrbacher.com/resume',
  name: 'Resume — Aaron Rohrbacher',
  description:
    'Resume of Aaron Rohrbacher — Lead Cross-Platform Software and DevOps Engineer based in Portland, Oregon.',
  isPartOf: { '@id': 'https://aaronrohrbacher.com/#website' },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://aaronrohrbacher.com' },
      { '@type': 'ListItem', position: 2, name: 'Resume', item: 'https://aaronrohrbacher.com/resume' },
    ],
  },
  mainEntity: {
    '@id': 'https://aaronrohrbacher.com/#person',
    '@type': 'Person',
    name: 'Aaron Rohrbacher',
    jobTitle: 'Lead Cross-Platform Software and DevOps Engineer',
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
    hasOccupation: [
      {
        '@type': 'EmployeeRole',
        roleName: 'Lead Software Development Engineer',
        startDate: '2024-12',
        endDate: '2026-03',
        employer: { '@type': 'Organization', name: 'Forbes AAC' },
      },
      {
        '@type': 'EmployeeRole',
        roleName: 'Technical Lead & Senior Software Engineer',
        startDate: '2022-08',
        endDate: '2025-02',
        employer: { '@type': 'Organization', name: 'SPARQ' },
      },
      {
        '@type': 'EmployeeRole',
        roleName: 'Proprietor, Systems Architect & Engineering Director',
        startDate: '2020-08',
        endDate: '2024-02',
        employer: { '@type': 'Organization', name: 'Nuel Cloud Computing LLC' },
      },
      {
        '@type': 'EmployeeRole',
        roleName: 'Software Engineer II',
        startDate: '2022-02',
        endDate: '2022-03',
        employer: { '@type': 'Organization', name: 'Nordic Semiconductor' },
      },
      {
        '@type': 'EmployeeRole',
        roleName: 'Junior Software Development Engineer',
        startDate: '2018-07',
        endDate: '2021-08',
        employer: { '@type': 'Organization', name: 'Fiduciary Benchmarks' },
      },
      {
        '@type': 'EmployeeRole',
        roleName: 'Web Development Intern',
        startDate: '2018-01',
        endDate: '2018-02',
        employer: { '@type': 'Organization', name: 'Planet Argon' },
      },
    ],
  },
};

export default async function ResumePage() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="resume" initialDark={initialDark}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(resumeJsonLd) }}
      />
      <Resume />
    </BaseLayout>
  );
}
