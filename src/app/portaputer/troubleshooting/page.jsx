import Troubleshooting from '@/components/portaputer/sections/Troubleshooting';
import Style from '@/components/portaputer/PortaputerPage.module.scss';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Troubleshooting',
  description:
    'The handful of things that occasionally go sideways with PortaPuter — and exactly what to do about each.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/troubleshooting',
  },
  openGraph: {
    title: 'Troubleshooting | PortaPuter',
    description:
      'What occasionally goes sideways with PortaPuter, and how to fix it.',
    url: 'https://portaputer.aaronrohrbacher.com/troubleshooting',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Troubleshooting />
    </main>
  );
}
