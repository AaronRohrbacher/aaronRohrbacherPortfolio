import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import * as cognito from '@/lib/cognitoAdmin';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/admin/users — List all users with their groups
 */
export async function GET(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = await cognito.listUsers();
    const withGroups = await Promise.all(
      users.map(async (u) => ({
        ...u,
        groups: await cognito.listGroupsForUser(u.username),
      }))
    );
    return NextResponse.json({ users: withGroups });
  } catch (err) {
    console.error('List users error:', err);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

/**
 * POST /api/admin/users — Invite a new user by email
 * Body: { email: string }
 */
export async function POST(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, autoConfirm } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    const user = await cognito.createUser(email, { suppressEmail: !!autoConfirm });
    return NextResponse.json({ user });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create user' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users?username=xxx — Delete a user
 */
export async function DELETE(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }
    await cognito.deleteUser(username);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete user error:', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
