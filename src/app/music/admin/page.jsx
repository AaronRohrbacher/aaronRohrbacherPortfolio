import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  title: absoluteSeoTitle(seoPageTitle('Admin', SEO_SITES.music)),
  robots: { index: false, follow: false },
};

import MusicAdmin from '@/components/music/MusicAdmin';

export default function MusicAdminPage() {
  return <MusicAdmin />;
}
