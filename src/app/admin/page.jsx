export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

import AdminPage from '@/components/admin/AdminPage';

export default function Admin() {
  return <AdminPage />;
}
