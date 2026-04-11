import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';
import {
  daysBetween,
  GscApiError,
  GscConfigError,
  parseRow,
  queryAllRows,
  type GscSearchType,
} from '@/lib/gsc';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5min max

const schema = z
  .object({
    siteId: z.string().optional(),
    days: z.number().int().min(1).max(90).optional().default(7),
    searchTypes: z
      .array(z.enum(['web', 'image', 'video', 'news']))
      .optional()
      .default(['web']),
  })
  .default({});

const BULK_DIMENSIONS = ['date', 'query', 'page', 'country', 'device'] as const;

/**
 * POST /api/admin/gsc/sync
 * Body: { siteId?, days?=7, searchTypes?=["web"] }
 *
 * Pour chaque GscProperty active et chaque searchType demande :
 *   1. querySearchAnalytics avec toutes les dimensions → une ligne par combo
 *   2. Supprime les rows existantes sur la periode (pour gerer les mises a jour
 *      retrospectives de GSC qui arrivent jusqu'a ~3j apres)
 *   3. Batch insert des nouvelles rows
 *
 * GSC a un delai ~2j avant d'avoir des donnees "final", donc on sync
 * jusqu'a aujourd'hui - 2j.
 */
export async function POST(req: Request) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return jsonError('invalid_json');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  const { siteId, days, searchTypes } = parsed.data;

  const properties = await prisma.gscProperty.findMany({
    where: siteId ? { siteId } : {},
    include: { site: { select: { id: true, domain: true } } },
  });

  if (properties.length === 0) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      message: 'no GSC property configured',
    });
  }

  const endDate = new Date(Date.now() - 2 * 86400000);
  const startDate = new Date(endDate.getTime() - (days - 1) * 86400000);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const results: Array<{
    siteId: string;
    propertyUrl: string;
    searchType: GscSearchType;
    upserted: number;
    errors: string[];
  }> = [];

  for (const prop of properties) {
    for (const st of searchTypes) {
      const perType = {
        siteId: prop.siteId,
        propertyUrl: prop.propertyUrl,
        searchType: st as GscSearchType,
        upserted: 0,
        errors: [] as string[],
      };

      try {
        const rawRows = await queryAllRows({
          propertyUrl: prop.propertyUrl,
          startDate: startStr,
          endDate: endStr,
          dimensions: [...BULK_DIMENSIONS],
          searchType: st as GscSearchType,
        });

        const parsed = rawRows
          .map((r) => parseRow(r, [...BULK_DIMENSIONS], startStr, st as GscSearchType))
          .filter((r) => r.query && r.page);

        // Supprime les rows existantes sur la periode (re-sync propre)
        await prisma.gscDaily.deleteMany({
          where: {
            siteId: prop.siteId,
            day: { gte: startDate, lte: endDate },
            searchType: st,
          },
        });

        // Batch insert par 500 pour eviter un payload trop gros
        const BATCH = 500;
        for (let i = 0; i < parsed.length; i += BATCH) {
          const chunk = parsed.slice(i, i + BATCH).map((r) => ({
            siteId: prop.siteId,
            day: new Date(r.day + 'T00:00:00Z'),
            query: r.query,
            page: r.page,
            country: r.country,
            device: r.device,
            searchType: r.searchType,
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          }));
          await prisma.gscDaily.createMany({
            data: chunk,
            skipDuplicates: true,
          });
          perType.upserted += chunk.length;
        }
      } catch (e) {
        if (e instanceof GscConfigError) {
          return jsonError('gsc_not_configured', 500, { message: e.message });
        }
        const msg =
          e instanceof GscApiError
            ? `[${e.status}] ${e.message}`
            : e instanceof Error
              ? e.message
              : 'unknown error';
        perType.errors.push(msg);
      }

      results.push(perType);
    }

    await prisma.gscProperty.update({
      where: { id: prop.id },
      data: { lastSyncAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    range: { start: startStr, end: endStr },
    results,
  });
}
