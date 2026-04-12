import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, jsonError } from '@/lib/admin-auth';
import { sendPushNotification } from '@/lib/web-push';

export const runtime = 'nodejs';

const notifySchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  url: z.string().url().optional(),
  icon: z.string().url().optional(),
  tag: z.string().max(100).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  // Dual-auth : x-admin-key OU session SUPERADMIN
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json');
  }

  const parsed = notifySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  // Verifie que le tenant existe
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, deletedAt: true },
  });
  if (!tenant || tenant.deletedAt) {
    return jsonError('tenant_not_found', 404);
  }

  // Charge toutes les subscriptions du tenant
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { tenantId },
  });

  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, cleaned: 0 });
  }

  let sent = 0;
  let failed = 0;
  const goneIds: string[] = [];

  // Envoi en parallele a toutes les subscriptions
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        parsed.data,
      );
      return { id: sub.id, result };
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.result.ok) {
        sent++;
      } else {
        failed++;
        if (r.value.result.gone) {
          goneIds.push(r.value.id);
        }
      }
    } else {
      failed++;
    }
  }

  // Supprime les subscriptions invalides (410 Gone)
  if (goneIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: goneIds } },
    });
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    cleaned: goneIds.length,
  });
}
