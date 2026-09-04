import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  title: absoluteSeoTitle(seoPageTitle('Admin', SEO_SITES.portaputer)),
  robots: { index: false, follow: false },
};

import PortaputerAdmin from '@/components/portaputer/PortaputerAdmin';
import AuthProviderWrapper from '@/components/portaputer/AuthProviderWrapper';

export default function PortaputerAdminPage() {
  return (
    <AuthProviderWrapper>
      <PortaputerAdmin />
    </AuthProviderWrapper>
  );
}
