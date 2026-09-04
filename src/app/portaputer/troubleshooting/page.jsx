import Troubleshooting from '@/components/portaputer/sections/Troubleshooting';
import Style from '@/components/portaputer/PortaputerPage.module.scss';
import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

const PAGE_TITLE = seoPageTitle('Troubleshooting', SEO_SITES.portaputer);

export const dynamic = 'force-static';

export const metadata = {
  title: absoluteSeoTitle(PAGE_TITLE),
  description:
    'The handful of things that occasionally go sideways with PortaPuter — and exactly what to do about each.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/troubleshooting',
  },
  openGraph: {
    title: PAGE_TITLE,
    description:
      'What occasionally goes sideways with PortaPuter, and how to fix it.',
    url: 'https://portaputer.aaronrohrbacher.com/troubleshooting',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: 'What occasionally goes sideways with PortaPuter, and how to fix it.',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Troubleshooting />
    </main>
  );
}
