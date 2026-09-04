import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.APP_SESSION_SECRET || process.env.LOCAL_JWT_SECRET || 'local-dev-secret-do-not-use-in-prod',
);

export async function issueAppSession(user, expires = '24h') {
  return new SignJWT({
    sub: user.sub,
    email: user.email,
    'cognito:groups': user.groups || [],
    token_use: 'app_session',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('music-magic-auth')
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(SECRET);
}

export async function verifyAppSession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: 'music-magic-auth' });
    if (payload.token_use !== 'app_session') return null;
    return {
      sub: payload.sub,
      email: payload.email,
      groups: payload['cognito:groups'] || [],
      isAdmin: (payload['cognito:groups'] || []).includes('admin'),
    };
  } catch { return null; }
}

export async function issueMediaGrant(trackId) {
  return new SignJWT({ trackId, token_use: 'media_grant' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('music-media')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(SECRET);
}

export async function verifyMediaGrant(token, trackId) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: 'music-media' });
    return payload.token_use === 'media_grant' && payload.trackId === trackId;
  } catch { return false; }
}
