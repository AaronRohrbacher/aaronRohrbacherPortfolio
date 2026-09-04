// Centralized notification helper for A-A-Bot server routes.
//
// Every visitor action worth Aaron's attention — message submission,
// contact-info request, scheduled call, and first chat message — flows
// through here. One call, rich metadata, consistent email format.
//
// Channels:
//   1. Amazon SES email — same pattern as src/functions/connect-notify.mjs.
//      Uses CONTACT_EMAIL_TO (to) and NOTIFY_FROM_EMAIL (from). Client is
//      pinned to us-west-2 because that's where Connect lives and where
//      the connect@aaronrohrbacher.com SES identity is verified.
//   2. `.data/notifications.log` append — always, so `tail -f` works in
//      dev and CloudWatch captures it via console in prod.
//
// Both channels run. Failures are LOUD (console.error) and surfaced in
// the return value so route handlers can log a visible warning.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = '.data';
const LOG_FILE = 'notifications.log';
const SES_REGION = 'us-west-2';

// Single SES client — AWS SDK v3 reuses the underlying HTTP client.
const ses = new SESClient({ region: SES_REGION });

// One-time warn if required env is missing, so the first notify call
// screams visibly into the dev terminal and CloudWatch logs.
let warnedAboutEnv = false;
function warnMissingEnvOnce() {
  if (warnedAboutEnv) return;
  warnedAboutEnv = true;
  const missing = [];
  if (!process.env.CONTACT_EMAIL_TO) missing.push('CONTACT_EMAIL_TO');
  if (!process.env.NOTIFY_FROM_EMAIL) missing.push('NOTIFY_FROM_EMAIL');
  if (missing.length) {
    console.error(
      `[notifyAaron] ⚠ MISSING ENV: ${missing.join(', ')}. ` +
      `SES email WILL NOT SEND. Set these in .env.local (and in ` +
      `sst.config.ts -> Portfolio.environment for prod).`,
    );
  }
}

// ── User-Agent → OS / Browser ───────────────────────────────────────────────
// Lightweight UA sniff. Not bulletproof; good enough to give Aaron a sense
// of who's on the other end without pulling in a UA-parser library.
function parseUserAgent(ua) {
  if (!ua) return { os: 'unknown', browser: 'unknown' };
  const s = ua;
  let os = 'unknown';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/CrOS/i.test(s)) os = 'ChromeOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let browser = 'unknown';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = 'Safari';

  return { os, browser };
}

// ── Request metadata extraction ─────────────────────────────────────────────
// Works on the Next.js `request` (Web Fetch Request) object.
export function extractClientMeta(request) {
  const headers = request?.headers;
  const get = (h) => (headers?.get ? headers.get(h) : null) || null;
  const geo = (name) => {
    const value = get(`x-open-next-${name}`) || get(`cloudfront-viewer-${name}`);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const xff = get('x-forwarded-for');
  const ip = (xff ? xff.split(',')[0].trim() : null) || get('x-real-ip') || 'unknown';
  const userAgent = get('user-agent') || 'unknown';
  const { os, browser } = parseUserAgent(userAgent);
  const acceptLanguage = get('accept-language') || 'unknown';
  const referer = get('referer') || get('referrer') || null;
  const host = get('host') || null;
  return {
    ip,
    userAgent,
    os,
    browser,
    acceptLanguage: acceptLanguage.split(',')[0].trim(),
    referer,
    host,
    city: geo('city'),
    region: geo('region') || geo('country-region'),
    country: geo('country'),
  };
}

// ── Format the email body ───────────────────────────────────────────────────
function formatBody({ kind, payload, meta, sessionId, timestamp }) {
  const lines = [];
  lines.push(`Event: ${kind}`);
  if (sessionId) lines.push(`Session: ${sessionId}`);
  lines.push(`Time:   ${timestamp}`);
  lines.push('');
  lines.push('── Visitor ─────────────────────────────────────────');
  lines.push(`IP:          ${meta.ip}`);
  lines.push(`OS:          ${meta.os}`);
  lines.push(`Browser:     ${meta.browser}`);
  lines.push(`Language:    ${meta.acceptLanguage}`);
  lines.push(`Location:    ${[meta.city, meta.region, meta.country].filter(Boolean).join(', ') || '-'}`);
  lines.push(`Host:        ${meta.host || '-'}`);
  lines.push(`Referer:     ${meta.referer || '-'}`);
  lines.push(`User-Agent:  ${meta.userAgent}`);
  lines.push('');
  lines.push('── Payload ────────────────────────────────────────');
  for (const [k, v] of Object.entries(payload || {})) {
    if (v == null || v === '') continue;
    lines.push(`${k}:  ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  return lines.join('\n');
}

function formatSubject({ kind, payload }) {
  const who = payload?.name || payload?.contactMethod || 'visitor';
  switch (kind) {
    case 'message': return `A-A-Bot: ${who} left a message`;
    case 'contact_request': return `A-A-Bot: ${who} requested your contact info`;
    case 'schedule_book': return `A-A-Bot: ${who} booked ${payload?.bookedLabel || 'a call'}`;
    case 'chat_session': return `A-A-Bot: new chat session started`;
    case 'chat_message': return `A-A-Bot: chat message (${payload?.role || '?'})`;
    default: return `A-A-Bot: ${kind}`;
  }
}

// ── Local-dev file log ──────────────────────────────────────────────────────
// Appended to `.data/notifications.log` so Aaron can `tail -f` it while
// running locally.
async function appendLog(entry) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
  } catch { /* noop */ }
  const line = '='.repeat(60) + '\n' + entry + '\n';
  try {
    await appendFile(join(LOG_DIR, LOG_FILE), line);
  } catch (err) {
    console.error('[notifyAaron] log write failed:', err.message);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Send a notification to Aaron about a visitor interaction.
 *
 * @param {Object} options
 * @param {Request} options.request  - The Next.js request (for headers)
 * @param {string} options.kind      - 'message' | 'contact_request' |
 *                                     'schedule_book' | 'chat_session' |
 *                                     'chat_message'
 * @param {Object} [options.payload] - Arbitrary k/v pairs to include
 * @param {string} [options.sessionId] - Optional session id
 * @returns {Promise<{ok: boolean, emailed: boolean, logged: boolean}>}
 */
export async function notifyAaron({ request, kind, payload = {}, sessionId }) {
  const meta = extractClientMeta(request);
  const timestamp = new Date().toISOString();
  const body = formatBody({ kind, payload, meta, sessionId, timestamp });
  const subject = formatSubject({ kind, payload });

  // Always log to the local file + CloudWatch-style JSON line.
  const logEntry = `[${timestamp}] ${subject}\n${body}`;
  await appendLog(logEntry);
  try {
    console.log(JSON.stringify({
      event: 'notify_aaron',
      kind,
      sessionId: sessionId || null,
      ip: meta.ip,
      os: meta.os,
      browser: meta.browser,
      city: meta.city,
      region: meta.region,
      country: meta.country,
      subject,
      payload,
      timestamp,
    }));
  } catch { /* noop */ }

  // Send via SES. Failures are LOUD and surfaced via the return value
  // so route handlers can log "notifyAaron failed" alongside the event.
  warnMissingEnvOnce();
  let emailed = false;
  let sendError = null;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!to || !from) {
    sendError = 'missing CONTACT_EMAIL_TO or NOTIFY_FROM_EMAIL';
  } else {
    try {
      await ses.send(new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
      }));
      emailed = true;
    } catch (err) {
      sendError = err?.message || String(err);
      console.error(
        `[notifyAaron] ⚠ SES send FAILED (kind=${kind}): ${sendError}`,
      );
    }
  }
  if (!emailed && sendError) {
    console.error(
      `[notifyAaron] ⚠ NO EMAIL SENT for ${kind} — ${sendError}. ` +
      `Event still written to ${join(LOG_DIR, LOG_FILE)}.`,
    );
  }

  return { ok: emailed, emailed, logged: true, error: sendError };
}
