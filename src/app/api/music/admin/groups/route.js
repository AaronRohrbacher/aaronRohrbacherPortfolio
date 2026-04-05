import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import * as cognito from '@/lib/cognitoAdmin';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/music/admin/groups — List all groups with members
 */
export async function GET(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const groups = await cognito.listGroups();
    const withMembers = await Promise.all(
      groups.map(async (g) => {
        const members = await cognito.listUsersInGroup(g.name);
        return { ...g, members };
      })
    );
    return NextResponse.json({ groups: withMembers });
  } catch (err) {
    console.error('List groups error:', err);
    return NextResponse.json({ error: 'Failed to list groups' }, { status: 500 });
  }
}

/**
 * POST /api/music/admin/groups — Create a group or add member
 * Body: { name, description } or { groupName, username, action: "add"|"remove" }
 */
export async function POST(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Add/remove member from group
    if (body.action) {
      const { groupName, username, action } = body;
      if (!groupName || !username) {
        return NextResponse.json({ error: 'groupName and username required' }, { status: 400 });
      }
      if (action === 'add') {
        await cognito.addUserToGroup(username, groupName);
      } else if (action === 'remove') {
        await cognito.removeUserFromGroup(username, groupName);
      }
      return NextResponse.json({ ok: true });
    }

    // Create group
    const { name, description } = body;
    if (!name) {
      return NextResponse.json({ error: 'Group name required' }, { status: 400 });
    }
    await cognito.createGroup(name, description || '');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Groups POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/music/admin/groups?name=xxx — Delete a group
 */
export async function DELETE(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'Group name required' }, { status: 400 });
    }
    await cognito.deleteGroup(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete group error:', err);
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 });
  }
}
