import { randomBytes } from 'crypto';
import { putItem, getItem, query, deleteItem, batchWrite, scanByPkPrefixes } from './dynamo';

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
