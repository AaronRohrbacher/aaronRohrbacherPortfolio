// Pure access-control helpers for music tracks. Zero dependencies — no DB,
// no HTTP, no AWS SDK — so they can be unit-tested directly and reused
// from every endpoint without pulling in the trackStore's storage layer.
//
// Model — DUMP TRUMPS:
//   - If a track lives in ZERO dumps, the track's OWN published+visibility
//     is authoritative. Use canViewTrackDirect.
//   - If a track lives in ONE OR MORE dumps, the dumps own visibility.
//     The track's own published/visibility is irrelevant. Use
//     canViewTrackInDumps with the list of dumps the dump-side index says
//     contain this track. (NOT track.dumpIds — that's the wrong direction
//     and can drift from the sibling-row index.)
//
// Endpoints follow this rule:
//
//     const admitted = containingDumps.length > 0
//       ? canViewTrackInDumps(containingDumps, { trackId, user, perms })
//       : canViewTrackDirect(track, { user, perms });
//
// Tiers:
//   public         → everyone
//   authenticated  → any signed-in user
//   restricted     → signed-in user whose track id is in permittedTrackIds
//
// Admins and valid share-token holders bypass these helpers entirely —
// callers handle those branches.

export function visibilityAdmits(tier, trackId, user, permittedTrackIds) {
  if (tier === 'public') return true;
  if (tier === 'authenticated') return !!user;
  if (tier === 'restricted') return !!user && permittedTrackIds.has(trackId);
  return false;
}

// Track-direct gate. Used ONLY for tracks that aren't in any dump.
export function canViewTrackDirect(track, { user = null, permittedTrackIds = new Set() } = {}) {
  if (!track || !track.published) return false;
  return visibilityAdmits(track.visibility || 'public', track.id, user, permittedTrackIds);
}

// Dump gate. The caller pre-computed which dumps contain this track via
// the DUMP-side index (sibling rows under DUMP#<id>). Returns true iff at
// least one of those dumps is published AND admits the viewer.
//
// Track-side state is intentionally absent from this signature — the rule
// is "dump owns visibility", and a helper that took the track would
// invite future drift bugs.
export function canViewTrackInDumps(
  containingDumps,
  { trackId, user = null, permittedTrackIds = new Set() } = {}
) {
  if (!Array.isArray(containingDumps) || containingDumps.length === 0) return false;
  for (const dump of containingDumps) {
    if (!dump || !dump.published) continue;
    if (visibilityAdmits(dump.visibility || 'public', trackId, user, permittedTrackIds)) {
      return true;
    }
  }
  return false;
}
