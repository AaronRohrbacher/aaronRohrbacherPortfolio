import Installation from '@/components/portaputer/sections/Installation';
import Style from '@/components/portaputer/PortaputerPage.module.scss';
import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

const PAGE_TITLE = seoPageTitle('Installation & Use', SEO_SITES.portaputer);

export const dynamic = 'force-static';

export const metadata = {
  title: absoluteSeoTitle(PAGE_TITLE),
  description:
    'Step-by-step PortaPuter walkthrough — capture a live Windows PC, install the portable VM, and launch your desktop in a window.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/installation',
  },
  openGraph: {
    title: PAGE_TITLE,
    description:
      'The full walkthrough: capture, install, launch. About half an hour of mostly-waiting.',
    url: 'https://portaputer.aaronrohrbacher.com/installation',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: 'The full walkthrough: capture, install, launch. About half an hour of mostly-waiting.',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Installation />
    </main>
  );
}
