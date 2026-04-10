export const metadata = {
  title: 'Contact',
  description: 'Get in touch with Aaron Rohrbacher.',
  openGraph: {
    title: 'Contact | Aaron Rohrbacher',
    description: 'Get in touch with Aaron Rohrbacher.',
    url: 'https://aaronrohrbacher.com/contact',
  },
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
