/**
 * Server wrapper for /dump/[id]. Provides per-dump metadata, canonicals,
 * and crawler-visible content. The interactive client (audio player,
 * share-token redemption, auth-error UI) lives in `./DumpClient.jsx` and
 * mounts on top of the server-rendered content.
 *
 * Visibility rules
 * ─────────────────
 *   • published + visibility=public → SSR full content + index.
 *   • anything else → SSR a minimal noindex shell. The client component
 *     handles the auth flow / 401 / 403 / 404 UI from there.
 *
 * Share tokens are intentionally NOT honored on the server-rendered path:
 *   - we can't safely consume (single-redeem) a token while a crawler is
 *     warming the page,
 *   - the token only ever appears on direct-share visits (never crawled).
 *   The client component still redeems tokens for human visitors.
 */

import { getDumpByHandle, getDumpTracks } from '@/lib/trackStore';
import { renderRichTextToPlainString } from '@/lib/richText';
import DumpClient from './DumpClient';
import { absoluteSeoTitle, seoPageTitle, SEO_SITES } from '@/lib/seoTitles';

// Render at request time. Dump metadata can change in admin (publish flips,
// description edits, track add/remove) and we want crawlers + visitors to
// see fresh state without a redeploy. Matches the music index page's mode.
export const revalidate = 300;
export async function generateStaticParams() { return []; }

const MUSIC_BASE = 'https://music.aaronrohrbacher.com';

// Fetch + visibility check shared between generateMetadata and the page.
// React's request-scoped fetch dedupe doesn't apply to plain function calls,
// so we re-query — both calls are cheap (single-table DDB lookups).
async function loadPublicDump(handle) {
  try {
    const dump = await getDumpByHandle(handle);
    if (!dump) return null;
    if (!dump.published) return null;
    if ((dump.visibility || 'public') !== 'public') return null;
    return dump;
  } catch {
    return null;
  }
}

function dumpUrl(dump, handle) {
  // Prefer the slug for the canonical so /dump/<dumpId> 308s into
  // /dump/<slug> in the user's mind even when both resolve. Fallback to
  // the handle the user requested if there's no slug.
  return `${MUSIC_BASE}/dump/${encodeURIComponent(dump.slug || handle)}`;
}

export async function generateMetadata({ params }) {
  const { id: handle } = await params;
  const dump = await loadPublicDump(handle);

  if (!dump) {
    // Either non-existent, unpublished, or non-public. Don't leak info —
    // just return a neutral noindex shell. The client component renders
    // the appropriate sign-in / denied / not-found UI for humans.
    return {
      title: absoluteSeoTitle(seoPageTitle('Music Unavailable', SEO_SITES.music)),
      robots: { index: false, follow: false },
    };
  }

  const plainDescription =
    renderRichTextToPlainString(dump.description) || `Listen to ${dump.name} by Aaron Rohrbacher.`;
  const url = dumpUrl(dump, handle);
  const title = seoPageTitle(dump.name, SEO_SITES.music);

  return {
    title: absoluteSeoTitle(title),
    description: plainDescription.slice(0, 300),
    alternates: { canonical: url },
    openGraph: {
      type: 'music.album',
      title,
      description: plainDescription.slice(0, 300),
      url,
      siteName: SEO_SITES.music,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: plainDescription.slice(0, 200),
    },
  };
}

export default async function DumpServerPage({ params }) {
  const { id: handle } = await params;
  const dump = await loadPublicDump(handle);

  // Non-public path: render only the client component. It handles the
  // auth/sign-in/denied UX. No SEO content is emitted.
  if (!dump) {
    return <DumpClient />;
  }

  // Public path: SSR the dump's name, description, and track list so
  // crawlers see real content, then mount the interactive player on top.
  const tracks = await getDumpTracks(dump.id).catch(() => []);
  const url = dumpUrl(dump, handle);
  const plainDescription = renderRichTextToPlainString(dump.description);
  const plainArtists = renderRichTextToPlainString(dump.artists);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    '@id': `${url}#album`,
    name: dump.name,
    url,
    ...(plainDescription ? { description: plainDescription } : {}),
    byArtist: {
      '@type': 'Person',
      name: plainArtists || 'Aaron Rohrbacher',
      url: 'https://music.aaronrohrbacher.com',
    },
    numTracks: tracks.length,
    track: tracks.map((t, i) => ({
      '@type': 'MusicRecording',
      position: i + 1,
      name: t.name,
      url: `${MUSIC_BASE}/track/${encodeURIComponent(t.id)}`,
      ...(t.artists
        ? {
            byArtist: {
              '@type': 'Person',
              name: renderRichTextToPlainString(t.artists) || 'Aaron Rohrbacher',
            },
          }
        : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Crawler-visible content. Hidden visually because the client
          component renders the same data interactively a moment later;
          duplicating in the DOM would create a flash. The CSS clip-path
          / size-zero pattern keeps it accessible in HTML for bots
          (and assistive tech) but invisible to sighted users. */}
      <div
        aria-hidden="false"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        <h1>{dump.name}</h1>
        {plainArtists && <p>{plainArtists}</p>}
        {plainDescription && <p>{plainDescription}</p>}
        {tracks.length > 0 && (
          <ol>
            {tracks.map((t) => (
              <li key={t.id}>
                {t.name}
                {t.artists ? ` — ${renderRichTextToPlainString(t.artists)}` : ''}
              </li>
            ))}
          </ol>
        )}
      </div>
      <DumpClient />
    </>
  );
}
