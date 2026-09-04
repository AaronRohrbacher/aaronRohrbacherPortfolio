import { SEO_SITES, seoPageTitle } from '@/lib/seoTitles';

export const metadata = {
  title: { absolute: seoPageTitle('Portfolio Admin', SEO_SITES.main) },
  robots: { index: false, follow: false },
};

import AdminPage from '@/components/admin/AdminPage';

export default function Admin() {
  return <AdminPage />;
}
