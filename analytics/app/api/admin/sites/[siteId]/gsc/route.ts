import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const schema = z.object({
  // GSC property URL format:
  //   "sc-domain:veridian.site"        (Domain property)
  //   "https://www.veridian.site/"     (URL-prefix property)
  propertyUrl: z.string().min(3).max(255),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return jsonError('site_not_found', 404);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  const gsc = await prisma.gscProperty.upsert({
    where: { siteId },
    create: { siteId, propertyUrl: parsed.data.propertyUrl },
    update: { propertyUrl: parsed.data.propertyUrl },
  });

  return NextResponse.json({ gscProperty: gsc });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  await prisma.gscProperty.deleteMany({ where: { siteId } });
  return NextResponse.json({ ok: true });
}
