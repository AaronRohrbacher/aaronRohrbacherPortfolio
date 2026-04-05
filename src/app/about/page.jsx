export const metadata = {
  title: 'About',
  description: 'Learn a little more about Aaron Rohrbacher and his endeavours in software.',
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import About from '@/components/about/About';

export default async function AboutPage() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="about" initialDark={initialDark}>
      <About />
    </BaseLayout>
  );
}
