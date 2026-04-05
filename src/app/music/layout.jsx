import { cookies } from 'next/headers';
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

export default async function MusicRootLayout({ children }) {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get('darkMode')?.value === 'true';

  return (
    <MusicLayout initialDark={initialDark}>
      {children}
    </MusicLayout>
  );
}
