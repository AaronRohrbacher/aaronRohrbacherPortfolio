export const metadata = {
  title: 'Aaron Rohrbacher | Lead AI Engineer & DevOps Architect',
  description: 'Portfolio of Aaron Rohrbacher — lead AI engineer and developer specializing in AI/ML, full-stack software engineering, and DevOps architecture. Based in Portland, Oregon.',
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
