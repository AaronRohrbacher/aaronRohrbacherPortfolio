export const metadata = {
  title: 'Aaron Rohrbacher | Lead Cross-Platform Software and DevOps Engineer',
  description: 'Portfolio of Aaron Rohrbacher — lead cross-platform software and DevOps engineer specializing in AI/ML, full-stack development, and cloud architecture. Based in Portland, Oregon.',
  openGraph: {
    title: 'Aaron Rohrbacher | Lead Cross-Platform Software and DevOps Engineer',
    description: 'Lead cross-platform software and DevOps engineer specializing in AI/ML, full-stack development, and cloud architecture.',
    url: 'https://aaronrohrbacher.com',
    type: 'website',
  },
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import Home from '@/components/home/Home';

export default async function HomePage() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="home" initialDark={initialDark}>
      <Home />
    </BaseLayout>
  );
}
