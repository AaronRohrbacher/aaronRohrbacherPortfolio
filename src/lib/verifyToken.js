import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyAppSession } from './appTokens';

const USE_LOCAL = !process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const REGION = process.env.NEXT_PUBLIC_AWS_REGION || 'us-west-2';
const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

// Local JWT verification
const LOCAL_SECRET = new TextEncoder().encode(
  process.env.LOCAL_JWT_SECRET || 'local-dev-secret-do-not-use-in-prod'
);

async function verifyLocalToken(token) {
  try {
    const { payload } = await jwtVerify(token, LOCAL_SECRET, { issuer: 'local-auth' });
    return {
      sub: payload.sub,
      email: payload.email,
      groups: payload['cognito:groups'] || [],
      isAdmin: (payload['cognito:groups'] || []).includes('admin'),
    };
  } catch {
    return null;
  }
}

// Cognito JWT verification
let _jwks;
function getJWKS() {
  if (!_jwks) {
    const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
    _jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }
  return _jwks;
}

async function verifyCognitoToken(token) {
  if (!USER_POOL_ID) return null;
  const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer,
      audience: CLIENT_ID,
    });
    return {
      sub: payload.sub,
      email: payload.email,
      groups: payload['cognito:groups'] || [],
      isAdmin: (payload['cognito:groups'] || []).includes('admin'),
    };
  } catch {
    return null;
  }
}

/**
 * Verify a JWT token. Automatically uses local or Cognito verification.
 */
export async function verifyToken(token) {
  if (!token) return null;
  const appSession = await verifyAppSession(token);
  if (appSession) return appSession;
  if (USE_LOCAL) return verifyLocalToken(token);
  return verifyCognitoToken(token);
}

/**
 * Extract and verify bearer token from request headers.
 */
export async function authenticateRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}
