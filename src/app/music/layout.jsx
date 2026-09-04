import MusicLayout from '@/components/music/MusicLayout';
import { SEO_HOME_TITLES, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  metadataBase: new URL('https://music.aaronrohrbacher.com'),
  title: {
    default: SEO_HOME_TITLES.music,
    template: `%s | ${SEO_SITES.music}`,
  },
  description: 'Listen to and download music by Aaron Rohrbacher in uploaded audio and video formats, including MP3, WAV, AAC, AIFF, and MP4.',
  alternates: {
    canonical: 'https://music.aaronrohrbacher.com',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function MusicRootLayout({ children }) {
  return (
    <MusicLayout>
      {children}
    </MusicLayout>
  );
}
