import Installation from '@/components/portaputer/sections/Installation';
import Style from '@/components/portaputer/PortaputerPage.module.scss';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Installation and Use',
  description:
    'Step-by-step PortaPuter walkthrough — capture a live Windows PC, install the portable VM, and launch your desktop in a window.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/installation',
  },
  openGraph: {
    title: 'Installation and Use | PortaPuter',
    description:
      'The full walkthrough: capture, install, launch. About half an hour of mostly-waiting.',
    url: 'https://portaputer.aaronrohrbacher.com/installation',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Installation />
    </main>
  );
}
