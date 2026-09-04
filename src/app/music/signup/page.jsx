import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  title: absoluteSeoTitle(seoPageTitle('Sign Up', SEO_SITES.music)),
  robots: { index: false, follow: false },
};

import SignupForm from '@/components/music/SignupForm';

export default function SignupPage() {
  return <SignupForm />;
}
