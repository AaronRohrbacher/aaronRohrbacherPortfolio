import { revalidatePath } from 'next/cache';

/** Invalidate OpenNext's standard ISR entries after an admin content write. */
export function invalidatePublicMusic({ trackId, dumpHandles = [] } = {}) {
  revalidatePath('/music', 'page');
  revalidatePath('/sitemap.xml');
  if (trackId) revalidatePath(`/music/track/${encodeURIComponent(trackId)}`, 'page');
  for (const handle of dumpHandles.filter(Boolean)) {
    revalidatePath(`/music/dump/${encodeURIComponent(handle)}`, 'page');
  }
}
