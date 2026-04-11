import { randomBytes } from 'crypto';
import { putItem, getItem, query, deleteItem, batchWrite, scanByPkPrefixes } from './dynamo';

// --- Track CRUD ---

// A track can belong to multiple dumps. The main TRACK#<id> row always lives
// on the `TRACKS` GSI1 partition so loadTracks sees every track regardless of
// assignment. For each (track, dump) assignment we also write a thin
// TRACK_DUMP#<trackId>#<dumpId> sibling row pointing at `DUMP#<dumpId>` on
// GSI1 so getDumpTracks can query it cheaply. Per-dump ordering lives on the
// sibling row, not the track row.
//
// Legacy rows written before this change stored a single `dumpId` field and
// used `GSI1PK: 'DUMP#<dumpId>'` on the main track row. Reads normalize both
// shapes into `dumpIds: string[]`. Any write path that updates a track also
// syncs the sibling rows and rewrites the main row with `GSI1PK: 'TRACKS'`.

function trackToItem(track) {
  const dumpIds = Array.isArray(track.dumpIds)
    ? track.dumpIds.filter(Boolean)
    : track.dumpId
    ? [track.dumpId]
    : [];
  return {
    PK: `TRACK#${track.id}`,
    SK: `TRACK#${track.id}`,
    GSI1PK: 'TRACKS',
    GSI1SK: `ORDER#${String(track.order ?? 0).padStart(6, '0')}`,
    id: track.id,
    name: track.name,
    description: track.description || '',
    artists: track.artists || '',
    published: track.published || false,
    visibility: track.visibility || 'public',
    formats: track.formats || {},
    order: track.order ?? 0,
    dumpIds,
    addedAt: track.addedAt || null,
    s3UploadedAt: track.s3UploadedAt || null,
  };
}

function itemToTrack(item) {
  // Normalize legacy single-dumpId rows into a dumpIds array.
  let dumpIds;
  if (Array.isArray(item.dumpIds)) {
    dumpIds = item.dumpIds.filter(Boolean);
  } else if (item.dumpId) {
    dumpIds = [item.dumpId];
  } else {
    dumpIds = [];
  }
  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    artists: item.artists || '',
    published: item.published || false,
    visibility: item.visibility || 'public',
    formats: item.formats || {},
    order: item.order ?? 0,
    dumpIds,
    addedAt: item.addedAt || null,
    s3UploadedAt: item.s3UploadedAt || null,
  };
}

export async function loadTracks() {
  const items = await query({ indexName: 'GSI1', gsi1pk: 'TRACKS' });
  // Only include main track rows (not sibling assignment rows, which live in
  // DUMP# partitions anyway but guard here just in case).
  return items
    .filter((i) => i.PK && i.PK.startsWith('TRACK#'))
    .map(itemToTrack)
    .sort((a, b) => a.order - b.order);
}

// Diff-aware write: syncs sibling rows with the track's dumpIds so (track,
// dump) assignments stay in lockstep with the main row. `previousDumpIds` may
// be omitted; if so we fetch the current stored state and diff against it.
export async function saveTrack(track, previousDumpIds) {
  const nextDumpIds = Array.isArray(track.dumpIds)
    ? track.dumpIds.filter(Boolean)
    : track.dumpId
    ? [track.dumpId]
    : [];

  let prev = previousDumpIds;
  if (prev == null) {
    const existing = await getTrack(track.id);
    prev = existing ? existing.dumpIds : [];
  }
  const prevSet = new Set(prev);
  const nextSet = new Set(nextDumpIds);

  const toAdd = nextDumpIds.filter((d) => !prevSet.has(d));
  const toRemove = prev.filter((d) => !nextSet.has(d));

  await putItem(trackToItem({ ...track, dumpIds: nextDumpIds }));

  for (const dumpId of toAdd) {
    await assignTrackToDump(track.id, dumpId);
  }
  for (const dumpId of toRemove) {
    await unassignTrackFromDump(track.id, dumpId);
  }
}

// Batch version. Also ensures sibling TRACK_DUMP# rows exist for each
// (track, dump) pair. This is idempotent — assignTrackToDump overwrites an
// existing sibling in place, preserving its per-dump order — so running this
// on every GET merge pass is safe and also seamlessly migrates legacy rows
// that were still pointing their main row at a DUMP# partition.
//
// NOTE: does NOT remove sibling rows that are no longer present on the
// track's dumpIds — batch callers today only reorder or bulk-sync metadata
// and never intentionally strip assignments. Use `saveTrack` to get diff-
// aware sibling cleanup.
export async function saveTracks(tracks) {
  const requests = tracks.map((track) => ({
    PutRequest: { Item: trackToItem(track) },
  }));
  await batchWrite(requests);
  for (const track of tracks) {
    const dumpIds = Array.isArray(track.dumpIds)
      ? track.dumpIds.filter(Boolean)
      : track.dumpId
      ? [track.dumpId]
      : [];
    for (const dumpId of dumpIds) {
      await assignTrackToDump(track.id, dumpId);
    }
  }
}

export async function getTrack(trackId) {
  const item = await getItem(`TRACK#${trackId}`, `TRACK#${trackId}`);
  return item ? itemToTrack(item) : null;
}

export async function deleteTrack(trackId) {
  // Clean up sibling rows for every dump this track is in.
  const track = await getTrack(trackId);
  if (track) {
    for (const dumpId of track.dumpIds) {
      await unassignTrackFromDump(trackId, dumpId);
    }
  }
  await deleteItem(`TRACK#${trackId}`, `TRACK#${trackId}`);
}

// --- Track <-> Dump sibling rows ---

function trackDumpPk(trackId, dumpId) {
  return `TRACK_DUMP#${trackId}#${dumpId}`;
}

// Assign a track to a dump by writing a sibling row. If the assignment
// already exists this is a no-op-ish overwrite (order is preserved unless an
// explicit `order` is given). If no order is given the new assignment is
// appended to the end of the dump's existing track order.
export async function assignTrackToDump(trackId, dumpId, order) {
  if (!trackId || !dumpId) return;
  const pk = trackDumpPk(trackId, dumpId);

  let finalOrder = order;
  if (finalOrder == null) {
    const existing = await getItem(pk, pk);
    if (existing?.order != null) {
      finalOrder = existing.order;
    } else {
      // Append: find the max order in this dump (sibling rows only, legacy
      // tracks also contribute to the ordering via their own `order` field).
      const items = await query({ indexName: 'GSI1', gsi1pk: `DUMP#${dumpId}` });
      let maxOrder = 0;
      for (const it of items) {
        if (typeof it.order === 'number' && it.order > maxOrder) maxOrder = it.order;
      }
      finalOrder = maxOrder + 1;
    }
  }

  await putItem({
    PK: pk,
    SK: pk,
    GSI1PK: `DUMP#${dumpId}`,
    GSI1SK: `ORDER#${String(finalOrder).padStart(6, '0')}#${trackId}`,
    trackId,
    dumpId,
    order: finalOrder,
  });
}

export async function unassignTrackFromDump(trackId, dumpId) {
  if (!trackId || !dumpId) return;
  const pk = trackDumpPk(trackId, dumpId);
  await deleteItem(pk, pk);
}

// Return the list of dumpIds a track belongs to. Mainly used to double-check
// stale clients; the source of truth is the `dumpIds` field on the track row.
export async function getDumpsForTrack(trackId) {
  const track = await getTrack(trackId);
  return track ? track.dumpIds : [];
}

// --- Merge S3 bucket contents with saved metadata ---

export function mergeTracks(savedTracks, bucketTracks) {
  const savedMap = new Map(savedTracks.map((t) => [t.id, t]));
  const merged = [];
  let maxOrder = Math.max(0, ...savedTracks.map((t) => t.order || 0));

  for (const [trackName, bucket] of Object.entries(bucketTracks)) {
    const { formats, addedAt } = bucket;
    const existing = savedMap.get(trackName);
    if (existing) {
      // Update formats from S3, keep addedAt if not overridden.
      // Always backfill s3UploadedAt from the S3 LastModified so the field
      // reflects the bucket's own mtime even on pre-existing rows.
      merged.push({
        ...existing,
        formats,
        addedAt: existing.addedAt || addedAt,
        s3UploadedAt: existing.s3UploadedAt || addedAt,
      });
    } else {
      maxOrder++;
      merged.push({
        id: trackName,
        name: trackName,
        description: '',
        artists: '',
        published: false,
        visibility: 'public',
        formats,
        order: maxOrder,
        dumpIds: [],
        addedAt,
        s3UploadedAt: addedAt,
      });
    }
  }

  merged.sort((a, b) => (a.order || 0) - (b.order || 0));
  return merged;
}

// --- Track Permissions ---

export async function getTrackPermissions(trackId) {
  const items = await query({ pk: `TRACK#${trackId}` });
  const users = [];
  const groups = [];
  for (const item of items) {
    if (item.SK.startsWith('USER#')) {
      users.push({ userId: item.SK.replace('USER#', ''), grantedAt: item.grantedAt, grantedBy: item.grantedBy });
    } else if (item.SK.startsWith('GROUP#')) {
      groups.push({ groupName: item.SK.replace('GROUP#', ''), grantedAt: item.grantedAt, grantedBy: item.grantedBy });
    }
  }
  return { users, groups };
}

export async function grantTrackAccess(trackId, targetType, targetId, grantedBy) {
  const sk = targetType === 'user' ? `USER#${targetId}` : `GROUP#${targetId}`;
  const gsi1pk = targetType === 'user' ? `USER#${targetId}` : `GROUP#${targetId}`;
  await putItem({
    PK: `TRACK#${trackId}`,
    SK: sk,
    GSI1PK: gsi1pk,
    GSI1SK: `TRACK#${trackId}`,
    grantedAt: new Date().toISOString(),
    grantedBy,
  });
}

export async function revokeTrackAccess(trackId, targetType, targetId) {
  const sk = targetType === 'user' ? `USER#${targetId}` : `GROUP#${targetId}`;
  await deleteItem(`TRACK#${trackId}`, sk);
}

export async function getTracksForUser(userId, userGroups = [], publishedDumpIds = new Set(), userEmail = null) {
  const allTracks = await loadAllTracks();

  // Get user-specific track permissions (check both sub and email since admin may grant by either)
  const userPerms = await query({ indexName: 'GSI1', gsi1pk: `USER#${userId}` });
  const permittedTrackIds = new Set(userPerms.map((p) => p.GSI1SK.replace('TRACK#', '')));

  if (userEmail && userEmail !== userId) {
    const emailPerms = await query({ indexName: 'GSI1', gsi1pk: `USER#${userEmail}` });
    for (const p of emailPerms) {
      permittedTrackIds.add(p.GSI1SK.replace('TRACK#', ''));
    }
  }

  // Get group-based track permissions (check both original and lowercase for case-insensitive matching)
  const checkedGroups = new Set();
  for (const groupName of userGroups) {
    for (const variant of [groupName, groupName.toLowerCase()]) {
      if (checkedGroups.has(variant)) continue;
      checkedGroups.add(variant);
      const groupPerms = await query({ indexName: 'GSI1', gsi1pk: `GROUP#${variant}` });
      for (const p of groupPerms) {
        permittedTrackIds.add(p.GSI1SK.replace('TRACK#', ''));
      }
    }
  }

  return allTracks.filter((track) => {
    const effectivelyPublished =
      track.published || track.dumpIds.some((id) => publishedDumpIds.has(id));
    if (!effectivelyPublished) return false;
    const vis = track.visibility || 'public';
    if (vis === 'public') return true;
    if (vis === 'authenticated') return true;
    if (vis === 'restricted') return permittedTrackIds.has(track.id);
    return false;
  });
}

// --- User Group Membership (in DynamoDB) ---

export async function addUserToGroup(userId, groupName) {
  await putItem({
    PK: `USER#${userId}`,
    SK: `GROUP#${groupName}`,
    GSI1PK: `GROUP#${groupName}`,
    GSI1SK: `USER#${userId}`,
    joinedAt: new Date().toISOString(),
  });
}

export async function removeUserFromGroup(userId, groupName) {
  await deleteItem(`USER#${userId}`, `GROUP#${groupName}`);
}

export async function getUserGroups(userId) {
  const items = await query({ pk: `USER#${userId}`, skPrefix: 'GROUP#' });
  return items.map((item) => item.SK.replace('GROUP#', ''));
}

export async function getGroupMembers(groupName) {
  const items = await query({ indexName: 'GSI1', gsi1pk: `GROUP#${groupName}`, gsi1skPrefix: 'USER#' });
  return items.map((item) => item.GSI1SK.replace('USER#', ''));
}

// --- Dumps (Releases) ---

function dumpToItem(dump) {
  return {
    PK: `DUMP#${dump.id}`,
    SK: `DUMP#${dump.id}`,
    GSI1PK: 'DUMPS',
    GSI1SK: `DATE#${dump.createdAt || new Date().toISOString()}`,
    id: dump.id,
    name: dump.name,
    description: dump.description || '',
    artists: dump.artists || '',
    visibility: dump.visibility || 'public',
    published: dump.published || false,
    createdAt: dump.createdAt || new Date().toISOString(),
  };
}

function itemToDump(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    artists: item.artists || '',
    visibility: item.visibility || 'public',
    published: item.published || false,
    createdAt: item.createdAt,
  };
}

export async function loadDumps() {
  const items = await query({ indexName: 'GSI1', gsi1pk: 'DUMPS' });
  return items.map(itemToDump).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDump(dumpId) {
  const item = await getItem(`DUMP#${dumpId}`, `DUMP#${dumpId}`);
  return item ? itemToDump(item) : null;
}

export async function saveDump(dump) {
  await putItem(dumpToItem(dump));
}

// Delete a dump and clean up all sibling rows assigning tracks to it.
export async function deleteDump(dumpId) {
  // Find every sibling row for this dump and remove it. Also strip the
  // dumpId off any legacy main-track rows that still live in this partition.
  const items = await query({ indexName: 'GSI1', gsi1pk: `DUMP#${dumpId}` });
  for (const item of items) {
    if (item.PK?.startsWith('TRACK_DUMP#')) {
      await deleteItem(item.PK, item.SK);
    } else if (item.PK?.startsWith('TRACK#')) {
      // Legacy main-track row with GSI1PK=DUMP#<dumpId>: rewrite it to drop
      // the dump assignment so it doesn't get orphaned on the dead partition.
      const track = itemToTrack(item);
      const remainingDumps = track.dumpIds.filter((d) => d !== dumpId);
      await putItem(trackToItem({ ...track, dumpIds: remainingDumps }));
    }
  }
  await deleteItem(`DUMP#${dumpId}`, `DUMP#${dumpId}`);
}

// Return tracks assigned to a dump, ordered by their per-dump order. Handles
// three cases: (1) new sibling-row assignments, (2) legacy main-row
// assignments that still live on this dump's GSI1 partition, (3) tracks whose
// main row lives in the TRACKS partition but whose `dumpIds` field includes
// this dump (e.g. written by a newer code path but GSI still catching up).
export async function getDumpTracks(dumpId) {
  const items = await query({ indexName: 'GSI1', gsi1pk: `DUMP#${dumpId}` });

  // Map of trackId -> per-dump order
  const orderByTrackId = new Map();
  // Tracks whose full record lives in this partition (legacy main rows)
  const legacyMainRows = [];
  // Sibling rows — we need to go fetch the actual track row separately
  const siblingTrackIds = [];

  for (const item of items) {
    if (item.PK?.startsWith('TRACK_DUMP#')) {
      siblingTrackIds.push(item.trackId);
      orderByTrackId.set(item.trackId, item.order ?? 0);
    } else if (item.PK?.startsWith('TRACK#')) {
      legacyMainRows.push(item);
      orderByTrackId.set(item.id, item.order ?? 0);
    }
  }

  const results = [];
  for (const item of legacyMainRows) {
    results.push(itemToTrack(item));
  }
  for (const trackId of siblingTrackIds) {
    // Avoid duplicates if a legacy row + sibling row both exist for the same id
    if (legacyMainRows.some((r) => r.id === trackId)) continue;
    const track = await getTrack(trackId);
    if (track) results.push(track);
  }

  return results
    .map((t) => ({ ...t, order: orderByTrackId.get(t.id) ?? t.order ?? 0 }))
    .sort((a, b) => a.order - b.order);
}

// Also need to load ALL tracks (including dump-assigned ones) for admin.
// The main TRACK row always lives on GSI1PK=TRACKS after the multi-dump
// migration, but legacy rows may still live on GSI1PK=DUMP#<id>, so we also
// walk each dump partition and de-dupe.
export async function loadAllTracks() {
  const trackRows = await query({ indexName: 'GSI1', gsi1pk: 'TRACKS' });
  const byId = new Map();
  for (const item of trackRows) {
    if (!item.PK?.startsWith('TRACK#')) continue;
    byId.set(item.id, itemToTrack(item));
  }

  // Pull in any legacy tracks whose main row still lives in a DUMP# partition.
  const dumps = await loadDumps();
  for (const dump of dumps) {
    const items = await query({ indexName: 'GSI1', gsi1pk: `DUMP#${dump.id}` });
    for (const item of items) {
      if (item.PK?.startsWith('TRACK#') && !byId.has(item.id)) {
        byId.set(item.id, itemToTrack(item));
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.order - b.order);
}

// --- Settings ---

export async function getSetting(key) {
  const item = await getItem('SETTINGS', `SETTING#${key}`);
  return item?.value ?? null;
}

export async function setSetting(key, value) {
  await putItem({ PK: 'SETTINGS', SK: `SETTING#${key}`, value });
}

// --- Share Links (login magic links, dump shares, track shares) ---
//
// Three sibling kinds of token, all stored under the same shape so we can
// list/edit/delete them from one admin tab without three near-identical
// code paths. Distinguished by `kind` and the matching ID field:
//
//   kind: 'login'  → email     → /music/login/magic?token=...     (passwordless login)
//   kind: 'dump'   → dumpId    → /music/dump/<id>?share=...        (public dump share)
//   kind: 'track'  → trackId   → /music/track/<id>?share=...       (public track share)
//
// All rows have: token, kind, createdBy, createdAt, expiresAt (nullable),
// active (default true), label (nullable). Missing `active` is treated as
// true so legacy rows continue to redeem.

const SHARE_KINDS = {
  login: { prefix: 'MAGIC', idField: 'email', indexPrefix: 'USER_MAGIC' },
  dump:  { prefix: 'DUMP_SHARE', idField: 'dumpId', indexPrefix: 'DUMP_SHARE_FOR' },
  track: { prefix: 'TRACK_SHARE', idField: 'trackId', indexPrefix: 'TRACK_SHARE_FOR' },
};

const SHARE_PK_PREFIXES = ['MAGIC#', 'DUMP_SHARE#', 'TRACK_SHARE#'];

function shareKindFromPk(pk) {
  if (pk.startsWith('MAGIC#')) return 'login';
  if (pk.startsWith('DUMP_SHARE#')) return 'dump';
  if (pk.startsWith('TRACK_SHARE#')) return 'track';
  return null;
}

function shareItemToRecord(item) {
  const kind = shareKindFromPk(item.PK);
  if (!kind) return null;
  const { idField } = SHARE_KINDS[kind];
  return {
    kind,
    token: item.token,
    [idField]: item[idField],
    label: item.label || null,
    active: item.active !== false,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt || null,
  };
}

function isShareLinkLive(item) {
  if (item.active === false) return false;
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) return false;
  return true;
}

async function createShareLink(kind, targetId, createdBy, { expiresInDays = null, label = null } = {}) {
  const cfg = SHARE_KINDS[kind];
  if (!cfg) throw new Error(`Unknown share-link kind: ${kind}`);
  const token = randomBytes(32).toString('hex');
  const expiresAt = expiresInDays
    ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString()
    : null;
  const createdAt = new Date().toISOString();
  await putItem({
    PK: `${cfg.prefix}#${token}`,
    SK: `${cfg.prefix}#${token}`,
    GSI1PK: `${cfg.indexPrefix}#${targetId}`,
    GSI1SK: `${cfg.prefix}#${token}`,
    token,
    [cfg.idField]: targetId,
    label,
    active: true,
    createdBy,
    createdAt,
    expiresAt,
  });
  return {
    kind,
    token,
    [cfg.idField]: targetId,
    label,
    active: true,
    createdBy,
    createdAt,
    expiresAt,
  };
}

async function redeemShareLink(kind, token) {
  const cfg = SHARE_KINDS[kind];
  if (!cfg) return null;
  const item = await getItem(`${cfg.prefix}#${token}`, `${cfg.prefix}#${token}`);
  if (!item) return null;
  if (!isShareLinkLive(item)) return null;
  return shareItemToRecord(item);
}

async function getShareLinksForTarget(kind, targetId) {
  const cfg = SHARE_KINDS[kind];
  if (!cfg) return [];
  const items = await query({ indexName: 'GSI1', gsi1pk: `${cfg.indexPrefix}#${targetId}` });
  return items
    .filter(isShareLinkLive)
    .map(shareItemToRecord)
    .filter(Boolean);
}

async function deleteShareLinkRow(kind, token) {
  const cfg = SHARE_KINDS[kind];
  if (!cfg) return;
  await deleteItem(`${cfg.prefix}#${token}`, `${cfg.prefix}#${token}`);
}

/**
 * List every share link in the system (all three kinds, including expired
 * and inactive). Used by the admin "Magic Links" tab.
 */
export async function listAllShareLinks() {
  const items = await scanByPkPrefixes(SHARE_PK_PREFIXES);
  return items.map(shareItemToRecord).filter(Boolean);
}

/**
 * Patch the editable fields of a share link. Target id (email/dumpId/trackId)
 * is immutable — changing what a token grants would be a different link.
 * `patch` may include: { label, active, expiresAt: ISO|null, expiresInDays }.
 */
export async function updateShareLink(kind, token, patch = {}) {
  const cfg = SHARE_KINDS[kind];
  if (!cfg) return null;
  const item = await getItem(`${cfg.prefix}#${token}`, `${cfg.prefix}#${token}`);
  if (!item) return null;

  if (patch.label !== undefined) item.label = patch.label || null;
  if (patch.active !== undefined) item.active = !!patch.active;
  if (patch.expiresInDays !== undefined) {
    item.expiresAt = patch.expiresInDays
      ? new Date(Date.now() + Number(patch.expiresInDays) * 86400000).toISOString()
      : null;
  } else if (patch.expiresAt !== undefined) {
    item.expiresAt = patch.expiresAt || null;
  }

  await putItem(item);
  return shareItemToRecord(item);
}

// ── Login magic links ────────────────────────────────────────────────────────
// Used by UserManager to mint a passwordless-login URL for an existing user.
// Behavior preserved; default expiry is now null (was 30d).

export async function createMagicLink(email, createdBy, expiresInDays = null, label = null) {
  const link = await createShareLink('login', email, createdBy, { expiresInDays, label });
  return { token: link.token, email: link.email, expiresAt: link.expiresAt };
}

export async function redeemMagicLink(token) {
  const link = await redeemShareLink('login', token);
  if (!link) return null;
  return { email: link.email, token: link.token };
}

export async function getMagicLinksForUser(email) {
  const links = await getShareLinksForTarget('login', email);
  return links.map((l) => ({
    token: l.token,
    email: l.email,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    createdBy: l.createdBy,
  }));
}

export async function deleteMagicLink(token) {
  await deleteShareLinkRow('login', token);
}

// ── Dump share links ─────────────────────────────────────────────────────────
// Public link granting access to one whole dump, no account needed. Behavior
// preserved; default expiry is now null (was 30d).

export async function createDumpShareLink(dumpId, createdBy, expiresInDays = null, label = null) {
  const link = await createShareLink('dump', dumpId, createdBy, { expiresInDays, label });
  return { token: link.token, dumpId: link.dumpId, expiresAt: link.expiresAt };
}

export async function redeemDumpShareLink(token) {
  const link = await redeemShareLink('dump', token);
  if (!link) return null;
  return { dumpId: link.dumpId, token: link.token };
}

export async function getDumpShareLinks(dumpId) {
  const links = await getShareLinksForTarget('dump', dumpId);
  return links.map((l) => ({
    token: l.token,
    dumpId: l.dumpId,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    createdBy: l.createdBy,
  }));
}

export async function deleteDumpShareLink(token) {
  await deleteShareLinkRow('dump', token);
}

// ── Track share links ────────────────────────────────────────────────────────
// Public link granting access to one specific track, no account needed.
// Mirrors dump share link behavior — admin redemption is bypass on the
// stream endpoint when the requested track id matches.

export async function createTrackShareLink(trackId, createdBy, expiresInDays = null, label = null) {
  const link = await createShareLink('track', trackId, createdBy, { expiresInDays, label });
  return { token: link.token, trackId: link.trackId, expiresAt: link.expiresAt };
}

export async function redeemTrackShareLink(token) {
  const link = await redeemShareLink('track', token);
  if (!link) return null;
  return { trackId: link.trackId, token: link.token };
}

export async function getTrackShareLinks(trackId) {
  const links = await getShareLinksForTarget('track', trackId);
  return links.map((l) => ({
    token: l.token,
    trackId: l.trackId,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    createdBy: l.createdBy,
  }));
}

export async function deleteTrackShareLink(token) {
  await deleteShareLinkRow('track', token);
}
