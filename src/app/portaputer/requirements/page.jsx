import Requirements from '@/components/portaputer/sections/Requirements';
import Style from '@/components/portaputer/PortaputerPage.module.scss';

export const dynamic = 'force-static';

export const metadata = {
  title: 'System Requirements',
  description:
    'What PortaPuter needs on the PC you\'re capturing and the PC you\'ll run the VM on.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/requirements',
  },
  openGraph: {
    title: 'System Requirements | PortaPuter',
    description:
      'What PortaPuter needs on the source and target PCs.',
    url: 'https://portaputer.aaronrohrbacher.com/requirements',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Requirements />
    </main>
  );
}
