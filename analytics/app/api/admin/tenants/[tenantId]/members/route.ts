import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { handlePrismaError, jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const addMemberSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

/**
 * GET /api/admin/tenants/:tenantId/members — list members
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) return jsonError('tenant_not_found', 404);

  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ members: memberships });
}

/**
 * POST /api/admin/tenants/:tenantId/members — add a member
 *
 * connectOrCreate: if the user doesn't exist yet, creates a bare User
 * with just their email. No password, no verification email sent.
 * The user will set their password via magic link or welcome page.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json');
  }

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  const { email, role } = parsed.data;

  // Check tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!tenant) return jsonError('tenant_not_found', 404);

  try {
    // connectOrCreate the user first, then create the membership
    const user = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
      select: { id: true, email: true, name: true },
    });

    const membership = await prisma.membership.create({
      data: {
        tenantId,
        userId: user.id,
        role,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (e) {
    const handled = handlePrismaError(e);
    if (handled) return handled;
    return jsonError('add_member_failed', 500);
  }
}

/**
 * DELETE /api/admin/tenants/:tenantId/members?email=x@y.com — remove a member
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;
  const url = new URL(req.url);
  const email = url.searchParams.get('email');

  if (!email) return jsonError('email_required', 400);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return jsonError('user_not_found', 404);

  try {
    await prisma.membership.delete({
      where: {
        tenantId_userId: { tenantId, userId: user.id },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handlePrismaError(e);
    if (handled) return handled;
    return jsonError('remove_member_failed', 500);
  }
}
