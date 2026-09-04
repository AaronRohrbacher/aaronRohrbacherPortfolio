import { getTrack, getDumpsContainingTrack, canViewTrackDirect } from '@/lib/trackStore';
import { renderRichTextToPlainString } from '@/lib/richText';
import TrackClient from './TrackClient';
import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

export const revalidate = 300;
export async function generateStaticParams() { return []; }
const MUSIC_BASE = 'https://music.aaronrohrbacher.com';

async function loadPublicTrack(id) {
  try {
    const track = await getTrack(id);
    if (!track) return null;
    if (canViewTrackDirect(track, { user: null })) return track;
    const dumps = await getDumpsContainingTrack(id);
    return dumps.some((dump) => dump.published && (dump.visibility || 'public') === 'public')
      ? track
      : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const track = await loadPublicTrack(id);
  if (!track) return { title: absoluteSeoTitle(seoPageTitle('Music Unavailable', SEO_SITES.music)), robots: { index: false, follow: false } };
  const description = renderRichTextToPlainString(track.description) || `Listen to ${track.name} by Aaron Rohrbacher.`;
  const url = `${MUSIC_BASE}/track/${encodeURIComponent(track.id)}`;
  const title = seoPageTitle(track.name, SEO_SITES.music);
  return {
    title: absoluteSeoTitle(title),
    description: description.slice(0, 300),
    alternates: { canonical: url },
    openGraph: { type: 'music.song', title, description, url, siteName: SEO_SITES.music },
    twitter: { card: 'summary_large_image', title, description: description.slice(0, 200) },
  };
}

export default async function TrackServerPage({ params }) {
  const { id } = await params;
  const track = await loadPublicTrack(id);
  if (!track) return <TrackClient />;
  const description = renderRichTextToPlainString(track.description);
  const artists = renderRichTextToPlainString(track.artists) || 'Aaron Rohrbacher';
  const url = `${MUSIC_BASE}/track/${encodeURIComponent(track.id)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: track.name,
    url,
    byArtist: { '@type': 'Person', name: artists },
    ...(description ? { description } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        <h1>{track.name}</h1><p>{artists}</p>{description && <p>{description}</p>}
      </div>
      <TrackClient />
    </>
  );
}
