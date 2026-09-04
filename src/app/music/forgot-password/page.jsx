import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  title: absoluteSeoTitle(seoPageTitle('Reset Password', SEO_SITES.music)),
  robots: { index: false, follow: false },
};

import ForgotPasswordForm from '@/components/music/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
