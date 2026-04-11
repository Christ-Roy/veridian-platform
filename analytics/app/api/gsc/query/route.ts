import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { gscQuery, type QueryRequest } from '@/lib/gsc-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const filterSchema = z.object({
  dimension: z.enum(['query', 'page', 'country', 'device']),
  operator: z.enum([
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'includingRegex',
    'excludingRegex',
  ]),
  expression: z.string().min(1).max(500),
});

const requestSchema = z.object({
  siteId: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dimensions: z
    .array(
      z.enum(['date', 'query', 'page', 'country', 'device', 'searchAppearance']),
    )
    .max(5)
    .optional(),
  dimensionFilterGroups: z
    .array(
      z.object({
        groupType: z.literal('and'),
        filters: z.array(filterSchema).min(1).max(10),
      }),
    )
    .max(5)
    .optional(),
  type: z
    .enum(['web', 'image', 'video', 'news', 'discover', 'googleNews'])
    .optional(),
  rowLimit: z.number().int().min(1).max(25000).optional(),
  startRow: z.number().int().min(0).optional(),
  orderBy: z
    .enum(['clicks', 'impressions', 'ctr', 'position', 'date'])
    .optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

/**
 * POST /api/gsc/query
 * Body: QueryRequest (shape identique a l'API GSC searchAnalytics.query)
 *
 * Protege par session utilisateur (auth.js). Interroge notre table GscDaily
 * via gscQuery, qui clone la semantique de l'API Google.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const res = await gscQuery(parsed.data as QueryRequest);
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query_failed';
    console.error('[gsc/query] error:', msg);
    return NextResponse.json(
      { error: 'query_failed', message: msg },
      { status: 500 },
    );
  }
}
