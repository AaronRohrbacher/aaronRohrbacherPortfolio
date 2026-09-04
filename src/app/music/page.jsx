import { listBucketTracks } from '@/lib/s3';
import {
  loadAllTracks,
  mergeTracks,
  loadDumps,
  getDumpTracks,
  canViewTrackDirect,
} from '@/lib/trackStore';
import MusicPlaylist from '@/components/music/MusicPlaylist';
import { absoluteSeoTitle, SEO_HOME_TITLES, SEO_SITES } from '@/lib/seoTitles';

export const metadata = {
  metadataBase: new URL('https://music.aaronrohrbacher.com'),
  title: absoluteSeoTitle(SEO_HOME_TITLES.music),
  description:
    'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — a Portland, Oregon software engineer and amateur audio engineer. Stream and download uploaded audio and video formats.',
  alternates: {
    canonical: 'https://music.aaronrohrbacher.com/',
  },
  openGraph: {
    title: SEO_HOME_TITLES.music,
    description:
      'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — Portland, Oregon. Stream and download uploaded audio and video formats.',
    type: 'music.playlist',
    url: 'https://music.aaronrohrbacher.com/',
    siteName: SEO_SITES.music,
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_HOME_TITLES.music,
    description:
      'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — Portland, Oregon. Stream and download uploaded audio and video formats.',
  },
};

// Public catalog HTML is generated on demand and stored in OpenNext's normal
// S3 ISR cache. Admin writes explicitly invalidate it via musicCache.js.
export const revalidate = 300;

export default async function MusicPage() {
  let initialTracks = [];
  let initialDumps = [];

  try {
    const bucketTracks = await listBucketTracks();
    const saved = await loadAllTracks();
    const merged = mergeTracks(saved, bucketTracks);

    const dumps = await loadDumps();

    // Two independent passes — track-side and dump-side. They don't talk.
    //
    //   LOOSE   — track's OWN published+visibility admits anon. No dump
    //             knowledge involved.
    //
    //   DUMPS   — for each viewable dump, ask THE DUMP what tracks it has
    //             (getDumpTracks → DUMP#<id> partition is the source of
    //             truth). Track-side `dumpIds` is irrelevant here. Inside
    //             a dump card, the dump's visibility wins, so even a
    //             restricted/unpublished track shows up.
    const project = (track) => ({
      id: track.id,
      name: track.name,
      description: track.description,
      artists: track.artists,
      dumpIds: track.dumpIds || [],
      addedAt: track.addedAt,
      formats: Object.keys(track.formats),
      streamUrls: Object.fromEntries(
        Object.keys(track.formats).map((f) => [f, `/api/stream?id=${encodeURIComponent(track.id)}&format=${f}`])
      ),
    });

    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

    initialTracks = merged
      .filter((t) => canViewTrackDirect(t, { user: null }))
      .slice()
      .sort(byOrder)
      .map(project);

    const viewableDumps = dumps.filter(
      (d) => d.published && (d.visibility || 'public') === 'public'
    );

    // The dump owns its tracks. Walk the dump-side index, then re-hydrate
    // each track from `merged` to pick up current S3 formats — and to drop
    // any whose audio file is gone from the bucket.
    const mergedById = new Map(merged.map((t) => [t.id, t]));
    const dumpTracksByDumpId = {};
    for (const dump of viewableDumps) {
      const dumpTracks = await getDumpTracks(dump.id);
      dumpTracksByDumpId[dump.id] = dumpTracks
        .map((t) => mergedById.get(t.id))
        .filter(Boolean);
    }

    initialDumps = viewableDumps
      .filter((d) => dumpTracksByDumpId[d.id].length > 0)
      .slice()
      .sort(byOrder)
      .map((d) => ({
        id: d.id,
        slug: d.slug || null,
        name: d.name,
        artists: d.artists,
        description: d.description,
        tracks: dumpTracksByDumpId[d.id].map(project),
      }));
  } catch (err) {
    console.error('SSR music fetch error:', err);
  }

  // JSON-LD structured data for SEO. Always include the Person/MusicGroup
  // identity even when the playlist is empty so Google has something
  // substantive to index instead of treating the page as a soft 404.
  // Dedupe by id — under the new listing model a track can appear in both
  // the loose section AND inside one or more dump cards, but we don't
  // want it counted twice in `numTracks`.
  const allItemsById = new Map();
  for (const t of [...initialDumps.flatMap((d) => d.tracks || []), ...initialTracks]) {
    if (!allItemsById.has(t.id)) allItemsById.set(t.id, t);
  }
  const allItems = [...allItemsById.values()];
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
          'Saxophone, clarinet, and home recordings by Aaron Rohrbacher — a Portland, Oregon software engineer and amateur audio engineer. Stream and download uploaded audio and video formats.',
        isPartOf: { '@type': 'WebSite', url: 'https://music.aaronrohrbacher.com', name: SEO_SITES.music },
        creator: aaron,
      },
      {
        '@type': 'MusicPlaylist',
        name: 'Music by Aaron Rohrbacher',
        description: 'Stream and download original recordings by Aaron Rohrbacher in their uploaded audio and video formats.',
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
