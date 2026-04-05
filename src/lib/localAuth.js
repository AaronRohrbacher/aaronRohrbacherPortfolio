/**
 * Local auth provider — replaces Cognito when USE_LOCAL=true.
 * Users stored in DynamoDB, JWTs signed with a local secret.
 * Server-side only.
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { putItem, getItem, query, deleteItem } from './dynamo';

const JWT_SECRET = new TextEncoder().encode(
  process.env.LOCAL_JWT_SECRET || 'local-dev-secret-do-not-use-in-prod'
);
const JWT_ISSUER = 'local-auth';

// --- DynamoDB helpers ---

function userToItem(user) {
  return {
    PK: `USER#${user.email}`,
    SK: `USER#${user.email}`,
    GSI1PK: 'USERS',
    GSI1SK: `USER#${user.email}`,
    sub: user.sub,
    email: user.email,
    passwordHash: user.passwordHash,
    groups: user.groups || [],
    status: user.status || 'CONFIRMED',
    enabled: user.enabled !== false,
    createdAt: user.createdAt || new Date().toISOString(),
  };
}

function itemToUser(item) {
  return {
    sub: item.sub,
    email: item.email,
    passwordHash: item.passwordHash,
    groups: item.groups || [],
    status: item.status || 'CONFIRMED',
    enabled: item.enabled !== false,
    createdAt: item.createdAt,
  };
}

// --- User Management ---

export async function createUser(email, password, groups = []) {
  const existing = await getItem(`USER#${email}`, `USER#${email}`);
  if (existing) throw new Error('User already exists');

  const hash = await bcrypt.hash(password, 10);
  const user = {
    sub: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    passwordHash: hash,
    groups,
    status: 'CONFIRMED',
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await putItem(userToItem(user));
  return user;
}

export async function deleteUser(email) {
  await deleteItem(`USER#${email}`, `USER#${email}`);
}

export async function listUsers() {
  const items = await query({ indexName: 'GSI1', gsi1pk: 'USERS' });
  return items.map(itemToUser).map(({ passwordHash, ...u }) => u);
}

export async function getUser(email) {
  const item = await getItem(`USER#${email}`, `USER#${email}`);
  if (!item) return null;
  const user = itemToUser(item);
  const { passwordHash, ...safe } = user;
  return safe;
}

export async function addUserToGroup(email, group) {
  const item = await getItem(`USER#${email}`, `USER#${email}`);
  if (!item) throw new Error('User not found');
  const user = itemToUser(item);
  if (!user.groups.includes(group)) user.groups.push(group);
  await putItem(userToItem(user));
}

export async function removeUserFromGroup(email, group) {
  const item = await getItem(`USER#${email}`, `USER#${email}`);
  if (!item) throw new Error('User not found');
  const user = itemToUser(item);
  user.groups = user.groups.filter((g) => g !== group);
  await putItem(userToItem(user));
}

export async function listGroupsForUser(email) {
  const item = await getItem(`USER#${email}`, `USER#${email}`);
  if (!item) return [];
  return item.groups || [];
}

// --- Auth ---

export async function authenticate(email, password) {
  const item = await getItem(`USER#${email}`, `USER#${email}`);
  if (!item || !item.enabled) throw new Error('Invalid email or password');
  const valid = await bcrypt.compare(password, item.passwordHash);
  if (!valid) throw new Error('Invalid email or password');
  return issueTokens(itemToUser(item));
}

export async function issueTokens(user) {
  const idToken = await new SignJWT({
    sub: user.sub,
    email: user.email,
    'cognito:groups': user.groups,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  return { idToken, sub: user.sub, email: user.email, groups: user.groups };
}

export async function verifyLocalToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER });
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

export async function changePassword(email, newPassword) {
  const item = await getItem(`USER#${email}`, `USER#${email}`);
  if (!item) throw new Error('User not found');
  const user = itemToUser(item);
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await putItem(userToItem(user));
}

// --- Groups (stored in DynamoDB) ---

export async function listGroups() {
  const items = await query({ indexName: 'GSI1', gsi1pk: 'AUTH_GROUPS' });
  return items.map((i) => ({ name: i.name, description: i.description || '', createdAt: i.createdAt }));
}

export async function createGroup(name, description = '') {
  const existing = await getItem(`AUTH_GROUP#${name}`, `AUTH_GROUP#${name}`);
  if (existing) throw new Error('Group already exists');
  await putItem({
    PK: `AUTH_GROUP#${name}`,
    SK: `AUTH_GROUP#${name}`,
    GSI1PK: 'AUTH_GROUPS',
    GSI1SK: `GROUP#${name}`,
    name,
    description,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteGroup(name) {
  await deleteItem(`AUTH_GROUP#${name}`, `AUTH_GROUP#${name}`);
}

export async function listUsersInGroup(groupName) {
  const users = await listUsers();
  return users.filter((u) => u.groups.includes(groupName));
}
