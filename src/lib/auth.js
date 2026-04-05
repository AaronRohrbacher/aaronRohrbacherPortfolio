const USE_LOCAL = !process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

// ─── Local Auth (API-backed, no Cognito SDK) ────────────────────────────────

const TOKEN_KEY = 'music_auth_token';

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token) {
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}

async function localSignIn(email, password) {
  const res = await fetch('/api/music/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sign in failed');
  setStoredToken(data.idToken);
  return data;
}

async function localSignUp(email, password) {
  const res = await fetch('/api/music/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sign up failed');
  // Local auth doesn't need confirmation
  return data;
}

async function localGetCurrentUser() {
  const token = getStoredToken();
  if (!token) return null;
  const res = await fetch('/api/music/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.user) {
    setStoredToken(null);
    return null;
  }
  return {
    sub: data.user.sub,
    email: data.user.email,
    groups: data.user.groups || [],
    isAdmin: (data.user.groups || []).includes('admin'),
  };
}

function localSignOut() {
  setStoredToken(null);
}

function localGetIdToken() {
  return getStoredToken();
}

// ─── Cognito Auth ────────────────────────────────────────────────────────────

let _cognitoModule = null;
async function getCognito() {
  if (!_cognitoModule) {
    _cognitoModule = await import('amazon-cognito-identity-js');
  }
  return _cognitoModule;
}

function getPoolData() {
  return {
    UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  };
}

async function cognitoSignUp(email, password) {
  const { CognitoUserPool, CognitoUserAttribute } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  return new Promise((resolve, reject) => {
    const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    pool.signUp(email, password, attrs, null, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function cognitoConfirmSignUp(email, code) {
  const { CognitoUserPool, CognitoUser } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function cognitoSignIn(email, password) {
  const { CognitoUserPool, CognitoUser, AuthenticationDetails } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
      newPasswordRequired: (userAttributes) => {
        resolve({ newPasswordRequired: true, userAttributes, cognitoUser });
      },
    });
  });
}

async function cognitoCompleteNewPassword(cognitoUser, newPassword) {
  return new Promise((resolve, reject) => {
    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

async function cognitoSignOut() {
  const { CognitoUserPool } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  const user = pool.getCurrentUser();
  if (user) user.signOut();
}

async function cognitoGetCurrentSession() {
  const { CognitoUserPool } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  const user = pool.getCurrentUser();
  if (!user) return null;
  return new Promise((resolve) => {
    user.getSession((err, session) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve(session);
    });
  });
}

async function cognitoGetIdToken() {
  const session = await cognitoGetCurrentSession();
  return session?.getIdToken()?.getJwtToken() || null;
}

async function cognitoGetCurrentUser() {
  const session = await cognitoGetCurrentSession();
  if (!session) return null;
  const idToken = session.getIdToken();
  const payload = idToken.decodePayload();
  return {
    sub: payload.sub,
    email: payload.email,
    groups: payload['cognito:groups'] || [],
    isAdmin: (payload['cognito:groups'] || []).includes('admin'),
  };
}

async function cognitoForgotPassword(email) {
  const { CognitoUserPool, CognitoUser } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: (data) => resolve(data),
      onFailure: (err) => reject(err),
    });
  });
}

async function cognitoConfirmPassword(email, code, newPassword) {
  const { CognitoUserPool, CognitoUser } = await getCognito();
  const pool = new CognitoUserPool(getPoolData());
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) => {
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

// ─── Unified Exports ─────────────────────────────────────────────────────────

export const signIn = USE_LOCAL
  ? localSignIn
  : async (email, password) => cognitoSignIn(email, password);

export const signUp = USE_LOCAL
  ? localSignUp
  : async (email, password) => cognitoSignUp(email, password);

export const confirmSignUp = USE_LOCAL
  ? async () => {} // no-op locally (auto-confirmed)
  : async (email, code) => cognitoConfirmSignUp(email, code);

export const completeNewPassword = USE_LOCAL
  ? async () => {} // no-op locally
  : async (cognitoUser, newPassword) => cognitoCompleteNewPassword(cognitoUser, newPassword);

export const signOut = USE_LOCAL
  ? localSignOut
  : () => cognitoSignOut();

export const getCurrentUser = USE_LOCAL
  ? localGetCurrentUser
  : cognitoGetCurrentUser;

export const getIdToken = USE_LOCAL
  ? async () => localGetIdToken()
  : cognitoGetIdToken;

export const forgotPassword = USE_LOCAL
  ? async () => { throw new Error('Use the setup script to reset passwords locally'); }
  : async (email) => cognitoForgotPassword(email);

export const confirmPassword = USE_LOCAL
  ? async () => {}
  : async (email, code, newPassword) => cognitoConfirmPassword(email, code, newPassword);
