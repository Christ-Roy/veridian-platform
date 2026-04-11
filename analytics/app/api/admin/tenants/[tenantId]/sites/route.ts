import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const schema = z.object({
  domain: z.string().min(3).max(255),
  name: z.string().min(1).max(100),
});

function trackerBaseUrl(req: Request): string {
  // Dev : http://100.92.215.42:3100 via NEXTAUTH_URL ou fallback host header.
  return process.env.NEXTAUTH_URL || `http://${req.headers.get('host')}`;
}

function snippet(base: string, siteKey: string): string {
  return `<script async src="${base}/tracker.js" data-site-key="${siteKey}"></script>`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) return jsonError('tenant_not_found', 404);

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

  const site = await prisma.site.create({
    data: {
      tenantId,
      domain: parsed.data.domain,
      name: parsed.data.name,
    },
  });

  const base = trackerBaseUrl(req);
  return NextResponse.json(
    {
      site,
      integration: {
        siteKey: site.siteKey,
        trackerScript: snippet(base, site.siteKey),
        endpoints: {
          pageview: `${base}/api/ingest/pageview`,
          form: `${base}/api/ingest/form`,
          call: `${base}/api/ingest/call`,
          gsc: `${base}/api/ingest/gsc`,
        },
      },
    },
    { status: 201 },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  const sites = await prisma.site.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
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
  });

  return NextResponse.json({ sites });
}
