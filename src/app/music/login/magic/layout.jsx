import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  title: absoluteSeoTitle(seoPageTitle('Magic Sign-In', SEO_SITES.music)),
  robots: { index: false, follow: false },
};

export default function MagicLoginLayout({ children }) {
  return children;
}
