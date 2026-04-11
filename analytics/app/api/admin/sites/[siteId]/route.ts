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
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      gscProperty: true,
      tenant: { select: { id: true, slug: true, name: true } },
      _count: {
        select: {
          pageviews: true,
          formSubmissions: true,
          sipCalls: true,
          gscDaily: true,
        },
      },
    },
  });
  if (!site || site.deletedAt) return jsonError('site_not_found', 404);
  return NextResponse.json({ site });
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    domain: z.string().min(3).max(255).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no_fields_to_update' });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
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
    const site = await prisma.site.update({
      where: { id: siteId, deletedAt: null },
      data: parsed.data,
    });
    return NextResponse.json({ site });
  } catch (e) {
    return handlePrismaError(e) ?? jsonError('update_failed', 500);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  try {
    if (hard) {
      await prisma.site.delete({ where: { id: siteId } });
    } else {
      await prisma.site.update({
        where: { id: siteId },
        data: { deletedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true, hard });
  } catch (e) {
    return handlePrismaError(e) ?? jsonError('delete_failed', 500);
  }
}

/**
 * POST /api/admin/sites/:id/rotate-key — genere un nouveau siteKey.
 * Invalide l'ancien immediatement. A utiliser si la cle fuite.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  if (action !== 'rotate-key') {
    return jsonError('unknown_action', 400, {
      hint: 'use ?action=rotate-key',
    });
  }

  try {
    // Genere un nouveau cuid via un insert dummy puis delete — plus simple :
    // on genere manuellement un id avec crypto.
    const crypto = await import('node:crypto');
    const newKey =
      'sk_' + crypto.randomBytes(24).toString('base64url').replace(/=/g, '');
    const site = await prisma.site.update({
      where: { id: siteId, deletedAt: null },
      data: { siteKey: newKey },
      select: { id: true, domain: true, siteKey: true },
    });
    return NextResponse.json({ site });
  } catch (e) {
    return handlePrismaError(e) ?? jsonError('rotate_failed', 500);
  }
}
