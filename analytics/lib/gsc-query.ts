import { prisma } from '@/lib/prisma';

/**
 * Query DSL qui reproduit exactement l'API GSC searchAnalytics.query, mais
 * interroge notre table GscDaily au lieu de l'API Google.
 *
 * Meme shape de requete / reponse que l'API Google pour que le meme code
 * frontend puisse (plus tard) brancher GSC directement ou notre clone.
 */

export type Dimension =
  | 'date'
  | 'query'
  | 'page'
  | 'country'
  | 'device'
  | 'searchAppearance';

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'includingRegex'
  | 'excludingRegex';

export type DimensionFilter = {
  dimension: Exclude<Dimension, 'searchAppearance'>;
  operator: FilterOperator;
  expression: string;
};

export type DimensionFilterGroup = {
  groupType: 'and';
  filters: DimensionFilter[];
};

export type SearchType =
  | 'web'
  | 'image'
  | 'video'
  | 'news'
  | 'discover'
  | 'googleNews';

export type QueryRequest = {
  siteId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: Dimension[];
  dimensionFilterGroups?: DimensionFilterGroup[];
  type?: SearchType;
  rowLimit?: number;
  startRow?: number;
  // NOTE: 'date' n'est pas dans l'API GSC publique mais on le supporte en
  // interne pour que le chart temporel puisse trier chronologiquement via SQL
  // au lieu de re-sort cote client (plus fiable quand on hit LIMIT).
  orderBy?: 'clicks' | 'impressions' | 'ctr' | 'position' | 'date';
  orderDir?: 'asc' | 'desc';
};

export type QueryRow = {
  keys: string[]; // valeurs des dimensions demandees
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type QueryResponse = {
  rows: QueryRow[];
  totalRows: number;
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
};

/**
 * Calcule les totaux globaux sur la periode AVEC tous les filtres appliques
 * (searchType + dimensionFilterGroups). GSC renvoie toujours les totals dans
 * la reponse searchAnalytics.query, et ils doivent refleter les filtres actifs
 * sinon les KPI sont incoherents avec le reste de la page.
 *
 * On reconstruit ici le meme whereSql que `gscQuery` pour etre sur que les
 * 3 metriques (clicks, impressions, position ponderee) sortent du MEME dataset.
 */
async function computeTotals(
  req: QueryRequest,
): Promise<QueryResponse['totals']> {
  const { whereSql, params } = buildRawWhere(req);
  const sql = `
    SELECT
      COALESCE(SUM(clicks), 0)::int AS clicks,
      COALESCE(SUM(impressions), 0)::int AS impressions,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(position * impressions)::float / SUM(impressions)
        ELSE 0 END AS position
    FROM analytics."GscDaily"
    WHERE ${whereSql}
  `;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ clicks: number; impressions: number; position: number }>
  >(sql, ...params);
  const clicks = Number(rows[0]?.clicks ?? 0);
  const impressions = Number(rows[0]?.impressions ?? 0);
  const position = Number(rows[0]?.position ?? 0);
  const ctr = impressions > 0 ? clicks / impressions : 0;
  return { clicks, impressions, ctr, position };
}

/**
 * Construit la clause WHERE SQL brute (avec placeholders $1..$N) et la liste
 * de params associes. Source unique pour computeTotals et gscQuery, pour
 * garantir que tous les calculs partagent exactement les memes filtres.
 */
function buildRawWhere(req: QueryRequest): {
  whereSql: string;
  params: unknown[];
} {
  const whereParts: string[] = [
    `"siteId" = $1`,
    `"day" >= $2`,
    `"day" <= $3`,
  ];
  const params: unknown[] = [
    req.siteId,
    new Date(req.startDate + 'T00:00:00Z'),
    new Date(req.endDate + 'T00:00:00Z'),
  ];
  let p = 4;

  if (req.type) {
    whereParts.push(`"searchType" = $${p++}`);
    params.push(req.type);
  }

  for (const g of req.dimensionFilterGroups ?? []) {
    for (const f of g.filters) {
      const col =
        f.dimension === 'query'
          ? '"query"'
          : f.dimension === 'page'
            ? '"page"'
            : f.dimension === 'country'
              ? '"country"'
              : f.dimension === 'device'
                ? '"device"'
                : null;
      if (!col) continue;
      switch (f.operator) {
        case 'equals':
          whereParts.push(`${col} = $${p++}`);
          params.push(f.expression);
          break;
        case 'notEquals':
          whereParts.push(`${col} <> $${p++}`);
          params.push(f.expression);
          break;
        case 'contains':
          whereParts.push(`${col} ILIKE $${p++}`);
          params.push(`%${f.expression}%`);
          break;
        case 'notContains':
          whereParts.push(`${col} NOT ILIKE $${p++}`);
          params.push(`%${f.expression}%`);
          break;
        case 'includingRegex':
          whereParts.push(`${col} ~ $${p++}`);
          params.push(f.expression);
          break;
        case 'excludingRegex':
          whereParts.push(`${col} !~ $${p++}`);
          params.push(f.expression);
          break;
      }
    }
  }

  return { whereSql: whereParts.join(' AND '), params };
}

/**
 * Execute la query en groupant par les dimensions demandees.
 * Utilise $queryRawUnsafe pour pouvoir construire dynamiquement les GROUP BY.
 */
export async function gscQuery(req: QueryRequest): Promise<QueryResponse> {
  const dimensions = (req.dimensions ?? []).filter(
    (d): d is Exclude<Dimension, 'searchAppearance'> =>
      d !== 'searchAppearance',
  );
  const rowLimit = Math.min(req.rowLimit ?? 1000, 25000);
  const startRow = req.startRow ?? 0;
  // NOTE: l'API GSC accepte implicitement "date" comme colonne de tri quand
  // la dimension date est demandee. On le supporte explicitement ici.
  const orderBy = req.orderBy ?? 'clicks';
  const orderDir = req.orderDir ?? 'desc';

  // Totals : recalcules via raw SQL unifie (inclut les dimensionFilterGroups,
  // contrairement a l'ancienne version qui ne filtrait pas la position).
  const totals = await computeTotals(req);

  // Pas de dimensions : on renvoie juste les totals comme une seule row.
  if (dimensions.length === 0) {
    const hasData = totals.clicks > 0 || totals.impressions > 0;
    return {
      rows: hasData
        ? [
            {
              keys: [],
              clicks: totals.clicks,
              impressions: totals.impressions,
              ctr: totals.ctr,
              position: totals.position,
            },
          ]
        : [],
      totalRows: hasData ? 1 : 0,
      totals,
    };
  }

  // Construit la query brute pour GROUP BY dynamique. On aggreg clicks,
  // impressions en SUM, et position ponderee par impressions (comme GSC).
  const dimCols = dimensions.map((d) => {
    if (d === 'date') return { col: '"day"', alias: 'date' };
    if (d === 'query') return { col: '"query"', alias: 'query' };
    if (d === 'page') return { col: '"page"', alias: 'page' };
    if (d === 'country') return { col: '"country"', alias: 'country' };
    if (d === 'device') return { col: '"device"', alias: 'device' };
    return { col: '"query"', alias: 'query' }; // fallback impossible
  });

  const selectDims = dimCols
    .map((c) => `${c.col} AS "${c.alias}"`)
    .join(', ');
  const groupDims = dimCols.map((c) => c.col).join(', ');

  // WHERE clause unifiee via buildRawWhere (meme source que computeTotals).
  const { whereSql, params: whereParams } = buildRawWhere(req);
  const params: unknown[] = [...whereParams];
  let p = params.length + 1;

  // Construit la clause ORDER BY. On supporte "date" meme si l'API public ne
  // l'expose pas — utile pour le chart temporel qui DOIT etre chronologique.
  const orderCol =
    orderBy === 'clicks'
      ? 'clicks'
      : orderBy === 'impressions'
        ? 'impressions'
        : orderBy === 'ctr'
          ? 'ctr'
          : orderBy === 'position'
            ? 'position'
            : '"day"'; // "date"
  const orderDirSql = orderDir === 'asc' ? 'ASC' : 'DESC';

  const limitSql = `LIMIT $${p++} OFFSET $${p++}`;
  params.push(rowLimit, startRow);

  const sql = `
    SELECT ${selectDims},
      SUM(clicks)::int AS clicks,
      SUM(impressions)::int AS impressions,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(clicks)::float / SUM(impressions)
        ELSE 0 END AS ctr,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(position * impressions)::float / SUM(impressions)
        ELSE 0 END AS position
    FROM analytics."GscDaily"
    WHERE ${whereSql}
    GROUP BY ${groupDims}
    ORDER BY ${orderCol} ${orderDirSql}
    ${limitSql}
  `;

  const raw = await prisma.$queryRawUnsafe<
    Array<Record<string, unknown>>
  >(sql, ...params);

  const rows: QueryRow[] = raw.map((r) => {
    const keys = dimensions.map((d) => {
      if (d === 'date') {
        const v = r.date;
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        // Quand la valeur arrive deja sous forme de string/Date-like
        if (typeof v === 'string') return v.slice(0, 10);
        return String(v);
      }
      return String(r[d] ?? '');
    });
    return {
      keys,
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      ctr: Number(r.ctr ?? 0),
      position: Number(r.position ?? 0),
    };
  });

  // Count total distinct rows pour la pagination — reuse whereSql SANS les
  // params rowLimit/startRow (les $LIMIT/$OFFSET ne sont pas dans whereSql
  // donc on ne passe que whereParams).
  const countSql = `
    SELECT COUNT(*)::int AS total FROM (
      SELECT 1 FROM analytics."GscDaily"
      WHERE ${whereSql}
      GROUP BY ${groupDims}
    ) sub
  `;
  const countRaw = await prisma.$queryRawUnsafe<
    Array<{ total: number }>
  >(countSql, ...whereParams);

  return {
    rows,
    totalRows: Number(countRaw[0]?.total ?? rows.length),
    totals,
  };
}
