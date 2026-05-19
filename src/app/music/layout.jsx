import MusicLayout from '@/components/music/MusicLayout';

export const metadata = {
  title: {
    default: 'Music | Aaron Rohrbacher',
    template: '%s | Aaron Rohrbacher',
  },
  description: 'Listen to and download music by Aaron Rohrbacher. Stream and download tracks in MP3, WAV, and AIFF.',
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
