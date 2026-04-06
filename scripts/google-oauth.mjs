#!/usr/bin/env node

/**
 * One-time helper to obtain a Google OAuth refresh token for the
 * scheduling Lambda. Walks you through consent in a browser, catches
 * the redirect on localhost, exchanges the code, prints the refresh
 * token so you can set it as an SST secret.
 *
 * Prerequisites:
 *   1. Google Cloud Console → create OAuth 2.0 Client ID, type "Desktop app"
 *   2. Add http://localhost:8080/oauth2callback as an authorized redirect URI
 *   3. Enable the Google Calendar API on the same project
 *
 * Usage:
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... \
 *   node scripts/google-oauth.mjs
 *
 * After it prints the refresh token:
 *   npx sst secret set GoogleOauthClientId     <client-id>     --stage production
 *   npx sst secret set GoogleOauthClientSecret <client-secret> --stage production
 *   npx sst secret set GoogleRefreshToken      <refresh-token> --stage production
 */

import { OAuth2Client } from 'google-auth-library';
import http from 'node:http';
import { URL } from 'node:url';

const PORT = 8080;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('error: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set.');
  console.error('Run with:');
  console.error('  GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/google-oauth.mjs');
  process.exit(1);
}

const oauth2 = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force refresh_token on every run
  scope: SCOPES,
});

console.log('\nOpen this URL in your browser to grant access:\n');
console.log(authUrl);
console.log('\nWaiting for redirect on', REDIRECT_URI, '...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');

  if (err) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(`OAuth error: ${err}`);
    console.error('OAuth denied:', err);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Missing code.');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Done.</h1><p>You can close this tab.</p>');

    console.log('--- tokens ---');
    if (tokens.refresh_token) {
      console.log('\nRefresh token (save this):');
      console.log(tokens.refresh_token);
      console.log('\nSet it via:');
      console.log(`  npx sst secret set GoogleRefreshToken '${tokens.refresh_token}' --stage production`);
    } else {
      console.warn('\nNo refresh_token returned. This usually means you previously authorized');
      console.warn('this client — revoke access at https://myaccount.google.com/permissions');
      console.warn('then re-run this script.');
    }
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`Token exchange failed: ${e.message}`);
    console.error('Token exchange failed:', e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
