import { listBucketTracks } from '@/lib/s3';
import { loadAllTracks, mergeTracks, loadDumps } from '@/lib/trackStore';
import MusicPlaylist from '@/components/music/MusicPlaylist';

export const metadata = {
  metadataBase: new URL('https://music.aaronrohrbacher.com'),
  title: 'Music',
  description:
    'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — a Portland, Oregon software engineer and amateur audio engineer. Stream and download tracks in MP3, WAV, and AIFF.',
  alternates: {
    canonical: 'https://music.aaronrohrbacher.com/',
  },
  openGraph: {
    title: 'Music | Aaron Rohrbacher',
    description:
      'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — Portland, Oregon. Stream and download MP3, WAV, AIFF.',
    type: 'music.playlist',
    url: 'https://music.aaronrohrbacher.com/',
    siteName: 'Aaron Rohrbacher · Music',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Music | Aaron Rohrbacher',
    description:
      'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — Portland, Oregon. Stream and download MP3, WAV, AIFF.',
  },
};

export const dynamic = 'force-dynamic';

export default async function MusicPage() {
  let initialTracks = [];
  let initialDumps = [];

  try {
    const bucketTracks = await listBucketTracks();
    const saved = await loadAllTracks();
    const merged = mergeTracks(saved, bucketTracks);

    const dumps = await loadDumps();
    const publishedDumpIds = new Set(dumps.filter((d) => d.published).map((d) => d.id));

    // Track is visible if published directly OR belongs to ANY published dump
    const allTracks = merged.filter((t) => {
      const dumpIds = Array.isArray(t.dumpIds) ? t.dumpIds : [];
      const effectivelyPublished = t.published || dumpIds.some((id) => publishedDumpIds.has(id));
      return effectivelyPublished && (t.visibility || 'public') === 'public';
    });
    const dumpMap = {};
    const loose = [];

    const withMeta = allTracks.map((track) => ({
      id: track.id,
      name: track.name,
      description: track.description,
      artists: track.artists,
      dumpIds: track.dumpIds || [],
      addedAt: track.addedAt,
      formats: Object.keys(track.formats),
      streamUrls: Object.fromEntries(
        Object.keys(track.formats).map((f) => [f, `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${f}`])
      ),
    }));

    for (const t of withMeta) {
      const publishedForTrack = (t.dumpIds || []).filter((id) => publishedDumpIds.has(id));
      if (publishedForTrack.length > 0) {
        for (const dumpId of publishedForTrack) {
          if (!dumpMap[dumpId]) dumpMap[dumpId] = [];
          dumpMap[dumpId].push(t);
        }
      } else {
        loose.push(t);
      }
    }

    initialDumps = dumps
      .filter((d) => d.published && dumpMap[d.id]?.length > 0)
      .map((d) => ({ id: d.id, name: d.name, artists: d.artists, description: d.description, tracks: dumpMap[d.id] }));
    initialTracks = loose;
  } catch (err) {
    console.error('SSR music fetch error:', err);
  }

  // JSON-LD structured data for SEO. Always include the Person/MusicGroup
  // identity even when the playlist is empty so Google has something
  // substantive to index instead of treating the page as a soft 404.
  const allItems = [...initialDumps.flatMap((d) => d.tracks || []), ...initialTracks];
  const aaron = {
    '@type': 'Person',
    name: 'Aaron Rohrbacher',
    url: 'https://music.aaronrohrbacher.com',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Portland',
      addressRegion: 'OR',
      addressCountry: 'US',
    },
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      aaron,
      {
        '@type': 'MusicGroup',
        name: 'Aaron Rohrbacher',
        member: aaron,
        instrument: ['Tenor saxophone', 'Clarinet'],
        url: 'https://music.aaronrohrbacher.com',
      },
      {
        '@type': 'CollectionPage',
        '@id': 'https://music.aaronrohrbacher.com/#collection',
        url: 'https://music.aaronrohrbacher.com/',
        name: 'Music by Aaron Rohrbacher',
        description:
          'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — a Portland, Oregon software engineer and amateur audio engineer. Stream and download tracks in MP3, WAV, and AIFF.',
        isPartOf: { '@type': 'WebSite', url: 'https://music.aaronrohrbacher.com', name: 'Aaron Rohrbacher · Music' },
        creator: aaron,
      },
      {
        '@type': 'MusicPlaylist',
        name: 'Music by Aaron Rohrbacher',
        description: 'Stream and download original recordings by Aaron Rohrbacher in MP3, WAV, and AIFF.',
        url: 'https://music.aaronrohrbacher.com/',
        numTracks: allItems.length,
        track: allItems.map((t, i) => ({
          '@type': 'MusicRecording',
          position: i + 1,
          name: t.name,
          byArtist: t.artists ? { '@type': 'Person', name: t.artists } : aaron,
          ...(t.description ? { description: t.description } : {}),
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MusicPlaylist initialTracks={initialTracks} initialDumps={initialDumps} />
    </>
  );
}
