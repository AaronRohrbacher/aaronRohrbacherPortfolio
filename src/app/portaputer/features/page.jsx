import Features from '@/components/portaputer/sections/Features';
import Style from '@/components/portaputer/PortaputerPage.module.scss';
import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

const PAGE_TITLE = seoPageTitle('Features', SEO_SITES.portaputer);

export const dynamic = 'force-static';

export const metadata = {
  title: absoluteSeoTitle(PAGE_TITLE),
  description:
    'What PortaPuter does so you don\'t have to think about it: zero-downtime capture, BitLocker handling, portable VM runtime, and more.',
  alternates: {
    canonical: 'https://portaputer.aaronrohrbacher.com/features',
  },
  openGraph: {
    title: PAGE_TITLE,
    description:
      'Zero-downtime capture, BitLocker handling, portable VM runtime, and more.',
    url: 'https://portaputer.aaronrohrbacher.com/features',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: 'Zero-downtime capture, BitLocker handling, portable VM runtime, and more.',
  },
};

export default function Page() {
  return (
    <main className={Style.main}>
      <Features />
    </main>
  );
}
