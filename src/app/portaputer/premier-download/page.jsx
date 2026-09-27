import { notFound } from 'next/navigation';
import PremierDownloader from '@/components/portaputer/PremierDownloader';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Download Premier',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PremierDownloadPage({ searchParams }) {
  const { key } = await searchParams;
  if (key !== '66514a35') notFound();
  return <PremierDownloader downloadKey={key} />;
}
