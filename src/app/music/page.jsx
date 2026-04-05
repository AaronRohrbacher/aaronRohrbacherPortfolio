import { listBucketTracks } from '@/lib/s3';
import { loadAllTracks, mergeTracks, loadDumps } from '@/lib/trackStore';
import MusicPlaylist from '@/components/music/MusicPlaylist';

export const metadata = {
  title: 'Music',
  description: 'Listen to and download music by Aaron Rohrbacher. Stream and download tracks in MP3, WAV, and AIFF.',
  openGraph: {
    title: 'Music | Aaron Rohrbacher',
    description: 'Listen to and download music by Aaron Rohrbacher.',
    type: 'music.playlist',
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

    // Track is visible if published directly OR belongs to a published dump
    const allTracks = merged.filter((t) =>
      (t.published || (t.dumpId && publishedDumpIds.has(t.dumpId))) &&
      (t.visibility || 'public') === 'public'
    );
    const dumpMap = {};
    const loose = [];

    const withMeta = allTracks.map((track) => ({
      id: track.id,
      name: track.name,
      description: track.description,
      artists: track.artists,
      dumpId: track.dumpId,
      addedAt: track.addedAt,
      formats: Object.keys(track.formats),
      streamUrls: Object.fromEntries(
        Object.keys(track.formats).map((f) => [f, `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${f}`])
      ),
    }));

    for (const t of withMeta) {
      if (t.dumpId && publishedDumpIds.has(t.dumpId)) {
        if (!dumpMap[t.dumpId]) dumpMap[t.dumpId] = [];
        dumpMap[t.dumpId].push(t);
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

  // JSON-LD structured data for SEO
  const allItems = [...initialDumps.flatMap((d) => d.tracks || []), ...initialTracks];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicPlaylist',
    name: 'Music by Aaron Rohrbacher',
    description: 'Listen to and download music by Aaron Rohrbacher.',
    numTracks: allItems.length,
    track: allItems.map((t, i) => ({
      '@type': 'MusicRecording',
      position: i + 1,
      name: t.name,
      ...(t.artists ? { byArtist: { '@type': 'Person', name: t.artists } } : {}),
      ...(t.description ? { description: t.description } : {}),
    })),
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
