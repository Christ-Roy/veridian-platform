import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  handlePrismaError,
  jsonError,
  requireAdmin,
} from '@/lib/admin-auth';

export const runtime = 'nodejs';

// ownerEmail est OBLIGATOIRE : un tenant sans membre n'a pas de sens
// (personne ne peut se loguer dessus) et casse le flow du skill
// analytics-provision. Si Claude n'a pas l'email du client, il doit
// demander a Robert avant d'appeler l'endpoint.
const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
      message:
        'slug must be lowercase alphanumeric + dashes, start/end with alphanumeric',
    }),
  ownerEmail: z.string().email().max(200),
});

export async function GET(req: Request) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      sites: {
        where: { deletedAt: null },
        select: {
          id: true,
          domain: true,
          name: true,
          siteKey: true,
          createdAt: true,
          gscProperty: {
            select: { propertyUrl: true, lastSyncAt: true },
          },
        },
      },
      memberships: {
        select: {
          role: true,
          user: { select: { id: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json({ tenants });
}

export async function POST(req: Request) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json');
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  const { name, slug, ownerEmail } = parsed.data;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        memberships: {
          create: {
            role: 'OWNER',
            user: {
              connectOrCreate: {
                where: { email: ownerEmail },
                create: { email: ownerEmail },
              },
            },
          },
        },
      },
      include: {
        sites: true,
        memberships: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (e) {
    const handled = handlePrismaError(e);
    if (handled) return handled;
    return jsonError('create_failed', 500);
  }
}
