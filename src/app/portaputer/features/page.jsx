import Features from '@/components/portaputer/sections/Features';
import Style from '@/components/portaputer/PortaputerPage.module.scss';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Features',
  description:
    'What PortaPuter does so you don\'t have to think about it: zero-downtime capture, BitLocker handling, portable VM runtime, and more.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/features',
  },
  openGraph: {
    title: 'Features | PortaPuter',
    description:
      'Zero-downtime capture, BitLocker handling, portable VM runtime, and more.',
    url: 'https://portaputer.aaronrohrbacher.com/features',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Features />
    </main>
  );
}
