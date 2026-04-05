export const metadata = {
  title: 'Resume',
  description: 'Resume of Aaron Rohrbacher, a Lead AI/ML Software Engineer and DevOps Architect based in Portland, Oregon.',
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
