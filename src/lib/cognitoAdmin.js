import * as local from './localAuth';

const USE_LOCAL = !process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

// ─── Local implementations ──────────────────────────────────────────────────

function normalizeLocalUser(u) {
  return { username: u.email, email: u.email, status: u.status || 'CONFIRMED', enabled: u.enabled !== false, createdAt: u.createdAt, sub: u.sub };
}

const localImpl = {
  async listUsers() {
    const users = await local.listUsers();
    return users.map(normalizeLocalUser);
  },

  async getUser(username) {
    const u = await local.getUser(username);
    return u ? normalizeLocalUser(u) : null;
  },

  async createUser(email, { suppressEmail = false } = {}) {
    // Local dev never sends email — suppressEmail is a no-op here.
    void suppressEmail;
    const user = await local.createUser(email, 'testapp123');
    return normalizeLocalUser(user);
  },

  async deleteUser(username) {
    await local.deleteUser(username);
  },

  async addUserToGroup(username, groupName) {
    await local.addUserToGroup(username, groupName);
  },

  async removeUserFromGroup(username, groupName) {
    await local.removeUserFromGroup(username, groupName);
  },

  async listGroupsForUser(username) {
    return local.listGroupsForUser(username);
  },

  async listGroups() {
    return local.listGroups();
  },

  async createGroup(groupName, description = '') {
    await local.createGroup(groupName, description);
  },

  async deleteGroup(groupName) {
    await local.deleteGroup(groupName);
  },

  async listUsersInGroup(groupName) {
    const users = await local.listUsersInGroup(groupName);
    return users.map(normalizeLocalUser);
  },
};

// ─── Cognito implementations ────────────────────────────────────────────────

let _cognitoClient;
async function getClient() {
  if (!_cognitoClient) {
    const { CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
    _cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-west-2',
    });
  }
  return _cognitoClient;
}

const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

function formatUser(cognitoUser) {
  if (!cognitoUser) return null;
  const attrs = {};
  for (const attr of cognitoUser.Attributes || cognitoUser.UserAttributes || []) {
    attrs[attr.Name] = attr.Value;
  }
  return {
    username: cognitoUser.Username,
    email: attrs.email || cognitoUser.Username,
    status: cognitoUser.UserStatus,
    enabled: cognitoUser.Enabled !== false,
    createdAt: cognitoUser.UserCreateDate?.toISOString(),
    sub: attrs.sub,
  };
}

const cognitoImpl = {
  async listUsers() {
    const { ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    const result = await client.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60 }));
    return (result.Users || []).map(formatUser);
  },

  async getUser(username) {
    const { AdminGetUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    const result = await client.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    return formatUser(result);
  },

  async createUser(email, { suppressEmail = false } = {}) {
    const { AdminCreateUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    const params = {
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
    };
    if (suppressEmail) {
      // Skip Cognito's default invite email — admin will share access
      // out-of-band (magic link, password reset, etc.).
      params.MessageAction = 'SUPPRESS';
    } else {
      params.DesiredDeliveryMediums = ['EMAIL'];
    }
    const result = await client.send(new AdminCreateUserCommand(params));
    return formatUser(result.User);
  },

  async deleteUser(username) {
    const { AdminDeleteUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    await client.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  },

  async addUserToGroup(username, groupName) {
    const { AdminAddUserToGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    await client.send(new AdminAddUserToGroupCommand({ UserPoolId: USER_POOL_ID, Username: username, GroupName: groupName }));
  },

  async removeUserFromGroup(username, groupName) {
    const { AdminRemoveUserFromGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    await client.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: USER_POOL_ID, Username: username, GroupName: groupName }));
  },

  async listGroupsForUser(username) {
    const { AdminListGroupsForUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    const result = await client.send(new AdminListGroupsForUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    return (result.Groups || []).map((g) => g.GroupName);
  },

  async listGroups() {
    const { ListGroupsCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    const result = await client.send(new ListGroupsCommand({ UserPoolId: USER_POOL_ID, Limit: 60 }));
    return (result.Groups || []).map((g) => ({
      name: g.GroupName,
      description: g.Description || '',
      createdAt: g.CreationDate?.toISOString(),
    }));
  },

  async createGroup(groupName, description = '') {
    const { CreateGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    await client.send(new CreateGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: groupName, Description: description }));
  },

  async deleteGroup(groupName) {
    const { DeleteGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    await client.send(new DeleteGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: groupName }));
  },

  async listUsersInGroup(groupName) {
    const { ListUsersInGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const client = await getClient();
    const result = await client.send(new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: groupName, Limit: 60 }));
    return (result.Users || []).map(formatUser);
  },
};

// ─── Exports (delegate to local or cognito) ─────────────────────────────────

const impl = USE_LOCAL ? localImpl : cognitoImpl;

export const listUsers = impl.listUsers;
export const getUser = impl.getUser;
export const createUser = impl.createUser;
export const deleteUser = impl.deleteUser;
export const addUserToGroup = impl.addUserToGroup;
export const removeUserFromGroup = impl.removeUserFromGroup;
export const listGroupsForUser = impl.listGroupsForUser;
export const listGroups = impl.listGroups;
export const createGroup = impl.createGroup;
export const deleteGroup = impl.deleteGroup;
export const listUsersInGroup = impl.listUsersInGroup;
