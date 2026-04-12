import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/push/client-subscribe — Endpoint PUBLIC pour les sites clients.
 *
 * Contrairement a /api/push/subscribe (qui exige une session Auth.js),
 * cet endpoint est appele par les visiteurs de sites clients qui n'ont
 * PAS de compte sur le dashboard Analytics. L'authentification se fait
 * via le siteKey (identifie le tenant proprietaire du site).
 *
 * Rate limit par IP : 10 subscriptions/min max.
 */

const clientSubscribeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const schema = z.object({
  siteKey: z.string().min(1),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  // Metadata device optionnelle — collectee par pwa-install.js au moment
  // du subscribe. Utile pour croiser avec les appels telephoniques et
  // segmenter les abonnes par plateforme/langue.
  device: z.object({
    userAgent: z.string().max(500).nullable().optional(),
    language: z.string().max(20).nullable().optional(),
    screenSize: z.string().max(20).nullable().optional(),
    platform: z.string().max(20).nullable().optional(),
    installPage: z.string().max(500).nullable().optional(),
  }).optional(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!clientSubscribeLimiter.check(ip)) {
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { siteKey, subscription, device } = parsed.data;

  // Resout le site + tenant via le siteKey
  const site = await prisma.site.findUnique({
    where: { siteKey },
    select: { id: true, tenantId: true, deletedAt: true },
  });

  if (!site || site.deletedAt) {
    return NextResponse.json({ error: 'site_not_found' }, { status: 404 });
  }

  // Upsert par endpoint (un browser = un endpoint unique).
  // On stocke les metadonnees device au create ET au update : si le user
  // reinstalle la PWA, ses infos sont rafraichies.
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      tenantId: site.tenantId,
      siteId: site.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: device?.userAgent || null,
      language: device?.language || null,
      screenSize: device?.screenSize || null,
      platform: device?.platform || null,
      installPage: device?.installPage || null,
      ip,
    },
    update: {
      tenantId: site.tenantId,
      siteId: site.id,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: device?.userAgent || null,
      language: device?.language || null,
      screenSize: device?.screenSize || null,
      platform: device?.platform || null,
      installPage: device?.installPage || null,
      ip,
    },
  });

  // Headers CORS pour les appels cross-origin depuis les sites clients
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    },
  );
}

// Preflight CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
