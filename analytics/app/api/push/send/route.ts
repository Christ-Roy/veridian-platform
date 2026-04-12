import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserTenantStatus } from '@/lib/user-tenant';
import { sendPushNotification } from '@/lib/web-push';
import { createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/push/send — Envoi de notification push par le TENANT (pas admin).
 *
 * Protege par session Auth.js : le tenant ne peut envoyer qu'a SES propres
 * abonnes. Pas besoin de x-admin-key.
 *
 * Rate limit : 10 envois/min par user (un envoi = broadcast a tous les
 * abonnes du tenant, pas 1 par device).
 */

const pushSendLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const sendSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  url: z.string().url().optional(),
  icon: z.string().url().optional(),
  tag: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!pushSendLimiter.check(session.user.email)) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: 60 },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Resout le tenant du user loggue
  const status = await getUserTenantStatus(session.user.email);
  if (!status) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
  }

  // Charge les subscriptions du tenant
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { tenantId: status.tenant.id },
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
