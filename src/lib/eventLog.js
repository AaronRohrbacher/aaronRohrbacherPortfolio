/**
 * Event logging — writes structured events to both CloudWatch (via
 * console.log, captured by Lambda) and DynamoDB (so they can be queried /
 * displayed in the admin panel).
 *
 * DynamoDB schema:
 *   PK:      EVENT#music | EVENT#portaputer
 *   SK:      ${isoTimestamp}#${randomId}
 *   GSI1PK:  EVENT_TYPE#${site}#${type}   — site-scoped filtering
 *   GSI1SK:  ${isoTimestamp}
 *   fields:  type, actor, targetType?, targetId?, detail?, ip?, userAgent?,
 *            city?, region?, country?, timestamp
 *
 * Call sites fire-and-forget: we wrap everything so a write failure never
 * breaks the caller's request.
 */
import { randomBytes } from 'crypto';
import { putItem, query, deleteItem } from './dynamo';

export const EVENT_TYPES = {
  // Auth
  SIGN_IN: 'auth.sign_in',
  SIGN_IN_FAIL: 'auth.sign_in_fail',
  SIGN_UP: 'auth.sign_up',
  SIGN_UP_CONFIRMED: 'auth.sign_up_confirmed',
  MAGIC_REDEEM: 'auth.magic_redeem',
  MAGIC_REDEEM_FAIL: 'auth.magic_redeem_fail',
  // Content
  STREAM: 'content.stream',
  DOWNLOAD: 'content.download',
  PLAYBACK_START: 'content.playback_start',
  PLAYBACK_PAUSE: 'content.playback_pause',
  PLAYBACK_PROGRESS: 'content.playback_progress',
  PLAYBACK_COMPLETE: 'content.playback_complete',
  PLAYBACK_ERROR: 'content.playback_error',
  PORTAPUTER_DOWNLOAD: 'content.portaputer_download',
  // Share links
  SHARE_CREATE: 'share.create',
  SHARE_REDEEM: 'share.redeem',
};

/**
 * Extract best-effort client IP + UA from a Next.js Request.
 * Returns { ip, userAgent } — values may be undefined.
 */
export function requestMeta(request) {
  if (!request || !request.headers || !request.headers.get) return {};
  const h = request.headers;
  const fwd = h.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || h.get('x-real-ip') || undefined;
  const userAgent = h.get('user-agent') || undefined;
  const geoHeader = (name) => {
    const value = h.get(`x-open-next-${name}`) || h.get(`cloudfront-viewer-${name}`) || undefined;
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  return {
    ip,
    userAgent,
    city: geoHeader('city'),
    region: geoHeader('region') || geoHeader('country-region'),
    country: geoHeader('country'),
  };
}

/**
 * Record an event. Never throws.
 */
export async function logEvent({ type, site, actor, targetType, targetId, detail, ip, userAgent, city, region, country }) {
  const timestamp = new Date().toISOString();
  const id = randomBytes(4).toString('hex');
  const eventSite = site || (type === EVENT_TYPES.PORTAPUTER_DOWNLOAD ? 'portaputer' : 'music');

  // CloudWatch structured line — always runs, even if DynamoDB is down.
  try {
    console.log(JSON.stringify({
      event: type,
      site: eventSite,
      actor: actor || null,
      targetType: targetType || null,
      targetId: targetId || null,
      detail: detail || null,
      ip: ip || null,
      userAgent: userAgent || null,
      city: city || null,
      region: region || null,
      country: country || null,
      timestamp,
    }));
  } catch {}

  // DynamoDB write — best-effort.
  try {
    await putItem({
      PK: `EVENT#${eventSite}`,
      SK: `${timestamp}#${id}`,
      GSI1PK: `EVENT_TYPE#${eventSite}#${type}`,
      GSI1SK: timestamp,
      type,
      site: eventSite,
      actor: actor || undefined,
      targetType: targetType || undefined,
      targetId: targetId || undefined,
      detail: detail || undefined,
      ip: ip || undefined,
      userAgent: userAgent || undefined,
      city: city || undefined,
      region: region || undefined,
      country: country || undefined,
      timestamp,
    });
  } catch (err) {
    console.error('eventLog putItem failed:', err?.message || err);
  }
}

/**
 * List recent events, newest first. Admin use only.
 * Options: { limit, type }
 */
export async function listEvents({ limit = 100, type, site = 'music' } = {}) {
  // Query the site-specific partition (or its site-specific type index).
  // query() helper doesn't expose scanIndexForward, so pull + sort here.
  const gsi1pk = type ? `EVENT_TYPE#${site}#${type}` : null;
  const items = gsi1pk
    ? await query({ indexName: 'GSI1', gsi1pk })
    : await query({ pk: `EVENT#${site}` });

  items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return items.slice(0, limit).map((i) => ({
    id: i.SK,
    site: i.site || site,
    type: i.type,
    actor: i.actor || null,
    targetType: i.targetType || null,
    targetId: i.targetId || null,
    detail: i.detail || null,
    ip: i.ip || null,
    userAgent: i.userAgent || null,
    city: i.city || null,
    region: i.region || null,
    country: i.country || null,
    timestamp: i.timestamp,
  }));
}

export async function deleteEvent(sk, site = 'music') {
  await deleteItem(`EVENT#${site}`, sk);
}
