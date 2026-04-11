import { randomBytes } from 'crypto';
import { putItem, getItem, query, deleteItem, batchWrite } from './dynamo';

// --- Track CRUD ---

function trackToItem(track) {
  return {
    PK: `TRACK#${track.id}`,
    SK: `TRACK#${track.id}`,
    GSI1PK: track.dumpId ? `DUMP#${track.dumpId}` : 'TRACKS',
    GSI1SK: `ORDER#${String(track.order ?? 0).padStart(6, '0')}`,
    id: track.id,
    name: track.name,
    description: track.description || '',
    artists: track.artists || '',
    published: track.published || false,
    visibility: track.visibility || 'public',
    formats: track.formats || {},
    order: track.order ?? 0,
    dumpId: track.dumpId || null,
    addedAt: track.addedAt || null,
    s3UploadedAt: track.s3UploadedAt || null,
  };
}

function itemToTrack(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    artists: item.artists || '',
    published: item.published || false,
    visibility: item.visibility || 'public',
    formats: item.formats || {},
    order: item.order ?? 0,
    dumpId: item.dumpId || null,
    addedAt: item.addedAt || null,
    s3UploadedAt: item.s3UploadedAt || null,
  };
}

export async function loadTracks() {
  const items = await query({ indexName: 'GSI1', gsi1pk: 'TRACKS' });
  return items.map(itemToTrack).sort((a, b) => a.order - b.order);
}

export async function saveTrack(track) {
  await putItem(trackToItem(track));
}

export async function saveTracks(tracks) {
  const requests = tracks.map((track) => ({
    PutRequest: { Item: trackToItem(track) },
  }));
  await batchWrite(requests);
}

export async function getTrack(trackId) {
  const item = await getItem(`TRACK#${trackId}`, `TRACK#${trackId}`);
  return item ? itemToTrack(item) : null;
}

export async function deleteTrack(trackId) {
  await deleteItem(`TRACK#${trackId}`, `TRACK#${trackId}`);
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
    const effectivelyPublished = track.published || (track.dumpId && publishedDumpIds.has(track.dumpId));
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

export async function deleteDump(dumpId) {
  await deleteItem(`DUMP#${dumpId}`, `DUMP#${dumpId}`);
}

export async function getDumpTracks(dumpId) {
  const items = await query({ indexName: 'GSI1', gsi1pk: `DUMP#${dumpId}` });
  return items.filter((i) => i.PK.startsWith('TRACK#')).map(itemToTrack).sort((a, b) => a.order - b.order);
}

// Also need to load ALL tracks (including dump-assigned ones) for admin
export async function loadAllTracks() {
  // Load unassigned tracks
  const unassigned = await query({ indexName: 'GSI1', gsi1pk: 'TRACKS' });
  // Load dumps to find dump-assigned tracks
  const dumps = await loadDumps();
  const dumpTracks = [];
  for (const dump of dumps) {
    const dt = await getDumpTracks(dump.id);
    dumpTracks.push(...dt);
  }
  return [...unassigned.map(itemToTrack), ...dumpTracks].sort((a, b) => a.order - b.order);
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
