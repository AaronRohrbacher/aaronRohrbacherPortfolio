import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  title: absoluteSeoTitle(seoPageTitle('Sign In', SEO_SITES.music)),
  robots: { index: false, follow: false },
};

import LoginForm from '@/components/music/LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
