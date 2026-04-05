export const metadata = {
  title: 'Contact',
  description: 'Get in touch with Aaron Rohrbacher.',
};

import { cookies } from 'next/headers';
import BaseLayout from '@/components/BaseLayout';
import ContactPage from '@/components/contact/ContactPage';

export default async function Contact() {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';
  return (
    <BaseLayout activePage="contact" initialDark={initialDark}>
      <ContactPage />
    </BaseLayout>
  );
}
