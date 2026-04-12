import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserTenantStatus } from '@/lib/user-tenant';

export const runtime = 'nodejs';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: Request) {
  // Session Auth.js requise
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Resout le tenant du user
  const cookieStore = await cookies();
  const asTenantSlug = cookieStore.get('veridian_admin_as_tenant')?.value ?? null;
  const status = await getUserTenantStatus(session.user.email, {
    asTenantSlug,
    requesterRole: (session.user as any).platformRole,
  });
  if (!status) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
  }

  const { endpoint, keys } = parsed.data;

  // Upsert par endpoint (un browser = un endpoint unique)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      tenantId: status.tenant.id,
      userId: session.user.id ?? undefined,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      tenantId: status.tenant.id,
      userId: session.user.id ?? undefined,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return NextResponse.json({ ok: true });
}
