export const metadata = {
  title: 'PortaPuter Admin',
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
