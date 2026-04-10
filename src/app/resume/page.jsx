export const metadata = {
  title: 'Resume',
  description: 'Resume of Aaron Rohrbacher — lead cross-platform software and DevOps engineer based in Portland, Oregon.',
  openGraph: {
    title: 'Resume | Aaron Rohrbacher',
    description: 'Resume of Aaron Rohrbacher — lead cross-platform software and DevOps engineer based in Portland, Oregon.',
    url: 'https://aaronrohrbacher.com/resume',
  },
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import Resume from '@/components/resume/Resume';

export default async function ResumePage() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="resume" initialDark={initialDark}>
      <Resume />
    </BaseLayout>
  );
}
