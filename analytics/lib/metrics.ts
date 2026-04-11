import { prisma } from '@/lib/prisma';

/**
 * Metriques du dashboard — 30j vs 30j precedents, plus un sparkline
 * journalier (30 points) pour chaque metric.
 *
 * Pour le POC : on agrege sur tous les sites de tous les tenants. Quand on
 * aura le user → tenant wiring, on filtrera par tenantId.
 */

export type SparklinePoint = { day: string; value: number };

export type MetricCard = {
  key: string;
  label: string;
  value: number;
  previous: number;
  deltaPct: number;
  href: string;
  unit?: string;
  sparkline: SparklinePoint[];
  /** taille relative du widget (1 = normal, 2 = grande carte col-span-2) */
  weight: 1 | 2;
};

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function emptySparkline(days = 30): SparklinePoint[] {
  const out: SparklinePoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ day: d.toISOString().slice(0, 10), value: 0 });
  }
  return out;
}

/**
 * Convertit un tableau de groupBy Prisma ({ day: Date, _count: X }) en
 * sparkline avec un point par jour des 30 derniers jours, 0 par defaut.
 */
function buildSparkline(
  rows: Array<{ day: string; value: number }>,
  days = 30,
): SparklinePoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, r.value);
  return emptySparkline(days).map((p) => ({
    day: p.day,
    value: byDay.get(p.day) ?? 0,
  }));
}

/**
 * Retourne les metriques du dashboard, triees par croissance decroissante.
 * Les metriques avec forte croissance (>20%) ont weight=2 pour prendre plus
 * de place dans la grille.
 */
export async function getDashboardMetrics(): Promise<MetricCard[]> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);

  // Counts 30j vs 60j — parallelises.
  const [
    pvCurr,
    pvPrev,
    formCurr,
    formPrev,
    callCurr,
    callPrev,
    clicksCurrSum,
    clicksPrevSum,
    pvDaily,
    formDaily,
    callDaily,
    gscDaily,
  ] = await Promise.all([
    prisma.pageview.count({ where: { createdAt: { gte: d30 } } }),
    prisma.pageview.count({
      where: { createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.formSubmission.count({ where: { createdAt: { gte: d30 } } }),
    prisma.formSubmission.count({
      where: { createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.sipCall.count({ where: { startedAt: { gte: d30 } } }),
    prisma.sipCall.count({ where: { startedAt: { gte: d60, lt: d30 } } }),
    prisma.gscDaily.aggregate({
      _sum: { clicks: true },
      where: { day: { gte: d30 } },
    }),
    prisma.gscDaily.aggregate({
      _sum: { clicks: true },
      where: { day: { gte: d60, lt: d30 } },
    }),
    // Sparklines — on utilise $queryRaw pour agreger par jour cote SQL.
    // Plus simple et plus rapide que groupBy sur createdAt.
    prisma.$queryRaw<Array<{ day: string; value: bigint }>>`
      SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS value
      FROM analytics."Pageview"
      WHERE "createdAt" >= ${d30}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ day: string; value: bigint }>>`
      SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS value
      FROM analytics."FormSubmission"
      WHERE "createdAt" >= ${d30}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ day: string; value: bigint }>>`
      SELECT TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS value
      FROM analytics."SipCall"
      WHERE "startedAt" >= ${d30}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ day: string; value: bigint }>>`
      SELECT TO_CHAR("day" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COALESCE(SUM("clicks"), 0)::bigint AS value
      FROM analytics."GscDaily"
      WHERE "day" >= ${d30}
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  const gscCurr = clicksCurrSum._sum.clicks ?? 0;
  const gscPrev = clicksPrevSum._sum.clicks ?? 0;

  const toPairs = (
    rows: Array<{ day: string; value: bigint }>,
  ): Array<{ day: string; value: number }> =>
    rows.map((r) => ({ day: r.day, value: Number(r.value) }));

  const raw: Omit<MetricCard, 'weight'>[] = [
    {
      key: 'pageviews',
      label: 'Pages vues',
      value: pvCurr,
      previous: pvPrev,
      deltaPct: pct(pvCurr, pvPrev),
      href: '/dashboard',
      sparkline: buildSparkline(toPairs(pvDaily)),
    },
    {
      key: 'forms',
      label: 'Formulaires soumis',
      value: formCurr,
      previous: formPrev,
      deltaPct: pct(formCurr, formPrev),
      href: '/dashboard/forms',
      sparkline: buildSparkline(toPairs(formDaily)),
    },
    {
      key: 'calls',
      label: 'Appels reçus',
      value: callCurr,
      previous: callPrev,
      deltaPct: pct(callCurr, callPrev),
      href: '/dashboard/calls',
      sparkline: buildSparkline(toPairs(callDaily)),
    },
    {
      key: 'gsc_clicks',
      label: 'Clics Google (GSC)',
      value: gscCurr,
      previous: gscPrev,
      deltaPct: pct(gscCurr, gscPrev),
      href: '/dashboard/gsc',
      sparkline: buildSparkline(toPairs(gscDaily)),
    },
  ];

  // Trie par delta decroissant puis assigne un weight.
  // Les 2 top performers prennent plus de place si leur delta est notable.
  const sorted = [...raw].sort((a, b) => b.deltaPct - a.deltaPct);
  return sorted.map((c, i) => ({
    ...c,
    weight: i < 2 && c.deltaPct >= 20 ? 2 : 1,
  }));
}
