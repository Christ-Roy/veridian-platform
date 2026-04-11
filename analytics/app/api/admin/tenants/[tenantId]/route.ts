import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  handlePrismaError,
  jsonError,
  requireAdmin,
} from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      sites: {
        where: { deletedAt: null },
        include: {
          gscProperty: { select: { propertyUrl: true, lastSyncAt: true } },
          _count: {
            select: {
              pageviews: true,
              formSubmissions: true,
              sipCalls: true,
              gscDaily: true,
            },
          },
        },
      },
      memberships: {
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });
  if (!tenant || tenant.deletedAt) return jsonError('tenant_not_found', 404);
  return NextResponse.json({ tenant });
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no_fields_to_update' });

export async function PATCH(
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  try {
    const tenant = await prisma.tenant.update({
      where: { id: tenantId, deletedAt: null },
      data: parsed.data,
    });
    return NextResponse.json({ tenant });
  } catch (e) {
    return handlePrismaError(e) ?? jsonError('update_failed', 500);
  }
}

/**
 * Soft delete : marque deletedAt. Les sites + data restent.
 * Pour un hard delete : DELETE + ?hard=true (POC, pas de confirmation).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;
  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  try {
    if (hard) {
      await prisma.tenant.delete({ where: { id: tenantId } });
    } else {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { deletedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true, hard });
  } catch (e) {
    return handlePrismaError(e) ?? jsonError('delete_failed', 500);
  }
}
