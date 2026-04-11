import { randomBytes } from 'crypto';
import { putItem, getItem, query, deleteItem, batchWrite } from './dynamo';

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
      // Update formats from S3, keep addedAt if not overridden
      merged.push({ ...existing, formats, addedAt: existing.addedAt || addedAt });
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

// --- Magic Links ---

export async function createMagicLink(email, createdBy, expiresInDays = 30) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  await putItem({
    PK: `MAGIC#${token}`,
    SK: `MAGIC#${token}`,
    GSI1PK: `USER_MAGIC#${email}`,
    GSI1SK: `MAGIC#${token}`,
    token,
    email,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return { token, email, expiresAt };
}

export async function redeemMagicLink(token) {
  const item = await getItem(`MAGIC#${token}`, `MAGIC#${token}`);
  if (!item) return null;
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) return null;
  return { email: item.email, token: item.token };
}

export async function getMagicLinksForUser(email) {
  const items = await query({ indexName: 'GSI1', gsi1pk: `USER_MAGIC#${email}` });
  return items
    .filter((i) => !i.expiresAt || new Date(i.expiresAt) >= new Date())
    .map((i) => ({ token: i.token, email: i.email, createdAt: i.createdAt, expiresAt: i.expiresAt, createdBy: i.createdBy }));
}

export async function deleteMagicLink(token) {
  await deleteItem(`MAGIC#${token}`, `MAGIC#${token}`);
}

// --- Dump Share Links (direct-to-dump, no account) ---

export async function createDumpShareLink(dumpId, createdBy, expiresInDays = 30) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  await putItem({
    PK: `DUMP_SHARE#${token}`,
    SK: `DUMP_SHARE#${token}`,
    GSI1PK: `DUMP_SHARE_FOR#${dumpId}`,
    GSI1SK: `DUMP_SHARE#${token}`,
    token,
    dumpId,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return { token, dumpId, expiresAt };
}

export async function redeemDumpShareLink(token) {
  const item = await getItem(`DUMP_SHARE#${token}`, `DUMP_SHARE#${token}`);
  if (!item) return null;
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) return null;
  return { dumpId: item.dumpId, token: item.token };
}

export async function getDumpShareLinks(dumpId) {
  const items = await query({ indexName: 'GSI1', gsi1pk: `DUMP_SHARE_FOR#${dumpId}` });
  return items
    .filter((i) => !i.expiresAt || new Date(i.expiresAt) >= new Date())
    .map((i) => ({ token: i.token, dumpId: i.dumpId, createdAt: i.createdAt, expiresAt: i.expiresAt, createdBy: i.createdBy }));
}

export async function deleteDumpShareLink(token) {
  await deleteItem(`DUMP_SHARE#${token}`, `DUMP_SHARE#${token}`);
}
