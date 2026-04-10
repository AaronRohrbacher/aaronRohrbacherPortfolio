export const metadata = {
  title: 'Portfolio',
  description: "Aaron Rohrbacher's portfolio of personal software projects.",
  openGraph: {
    title: 'Portfolio | Aaron Rohrbacher',
    description: "Aaron Rohrbacher's portfolio of personal software projects.",
    url: 'https://aaronrohrbacher.com/portfolio',
  },
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import Portfolio from '@/components/portfolio/Portfolio';

export default async function PortfolioPage() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="portfolio" initialDark={initialDark}>
      <Portfolio />
    </BaseLayout>
  );
}
