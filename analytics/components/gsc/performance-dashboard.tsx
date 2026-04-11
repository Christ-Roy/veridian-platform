'use client';

import { useEffect, useMemo, useState } from 'react';
import { KpiTile } from './kpi-tile';
import { TimeSeriesChart } from './time-series-chart';
import { GscDataTable } from './data-table';
import { FiltersBar } from './filters-bar';
import {
  DATE_RANGES,
  DIMENSION_META,
  SEARCH_TYPES,
  type DimensionKey,
  type GscFilter,
  type MetricKey,
  type QueryResponse,
  type SearchType,
} from './types';
import { cn } from '@/lib/utils';

type Site = {
  id: string;
  domain: string;
  name: string;
  gscAttached: boolean;
};

const MAIN_DIMENSIONS: DimensionKey[] = [
  'query',
  'page',
  'country',
  'device',
  'date',
  'searchAppearance',
];

export function PerformanceDashboard({ sites }: { sites: Site[] }) {
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
  const [rangeKey, setRangeKey] = useState<string>('28d');
  const [searchType, setSearchType] = useState<SearchType>('web');
  const [filters, setFilters] = useState<GscFilter[]>([]);
  const [activeTab, setActiveTab] = useState<DimensionKey>('query');
  const [activeMetrics, setActiveMetrics] = useState<
    Record<MetricKey, boolean>
  >({
    clicks: true,
    impressions: true,
    ctr: false,
    position: false,
  });
  const [orderBy, setOrderBy] = useState<MetricKey>('clicks');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Totals + time series (toujours groupes par date)
  const [timeSeries, setTimeSeries] = useState<QueryResponse | null>(null);
  // Tabulaire selon l'onglet actif
  const [tabData, setTabData] = useState<QueryResponse | null>(null);

  // Calcule les dates
  const { startDate, endDate } = useMemo(() => {
    const range = DATE_RANGES.find((r) => r.value === rangeKey) || DATE_RANGES[1];
    const end = new Date(Date.now() - 2 * 86400000); // -2j comme GSC
    const start = new Date(end.getTime() - (range.days - 1) * 86400000);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [rangeKey]);

  // Construit la query commune (siteId, dates, filters, searchType)
  const baseRequest = useMemo(
    () => ({
      siteId,
      startDate,
      endDate,
      type: searchType,
      dimensionFilterGroups:
        filters.length > 0
          ? [{ groupType: 'and' as const, filters }]
          : undefined,
    }),
    [siteId, startDate, endDate, searchType, filters],
  );

  // Reset page si changement de tab / filters / date range / site / type.
  // NOTE: ce useEffect tire un render supplementaire, mais le fetch tabData
  // ci-dessous voit le meme changement via baseRequest et fetche qu'une seule
  // fois (React batch les setStates). Le reset est necessaire sinon on reste
  // sur page 3 quand on change de dimension, et on peut se retrouver hors
  // bornes -> empty rows bizarre.
  useEffect(() => {
    setCurrentPage(0);
  }, [activeTab, filters, rangeKey, searchType, siteId]);

  // Fetch time series (dimensions=['date'], tri SQL par date asc — donne
  // directement le bon ordre chronologique sans re-sort cote client).
  // rowLimit 500 couvre jusqu'a 16 mois (480j), large pour le range max.
  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch('/api/gsc/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseRequest,
        dimensions: ['date'],
        rowLimit: 500,
        orderBy: 'date',
        orderDir: 'asc',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setTimeSeries(data);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [baseRequest, siteId]);

  // Fetch tab data. Pour tous les tabs, on utilise le `orderBy`/`orderDir`
  // choisis par l'utilisateur (defaut clicks desc). Les dates du tab "date"
  // seront donc triees par clicks — c'est l'UX GSC standard.
  useEffect(() => {
    if (!siteId || activeTab === 'searchAppearance') {
      setTabData({
        rows: [],
        totalRows: 0,
        totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      });
      return;
    }
    let alive = true;
    fetch('/api/gsc/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseRequest,
        dimensions: [activeTab],
        rowLimit: pageSize,
        startRow: currentPage * pageSize,
        orderBy,
        orderDir,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setTabData(data);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [baseRequest, activeTab, orderBy, orderDir, currentPage, siteId]);

  // Transform time series en donnees pour le chart
  const seriesData = useMemo(() => {
    if (!timeSeries) {
      return {
        clicks: [],
        impressions: [],
        ctr: [],
        position: [],
      };
    }
    return {
      clicks: timeSeries.rows.map((r) => ({ day: r.keys[0], value: r.clicks })),
      impressions: timeSeries.rows.map((r) => ({
        day: r.keys[0],
        value: r.impressions,
      })),
      ctr: timeSeries.rows.map((r) => ({ day: r.keys[0], value: r.ctr })),
      position: timeSeries.rows.map((r) => ({
        day: r.keys[0],
        value: r.position,
      })),
    };
  }, [timeSeries]);

  const totals = timeSeries?.totals ?? {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
  };

  const toggleMetric = (m: MetricKey) => {
    setActiveMetrics((prev) => {
      const next = { ...prev, [m]: !prev[m] };
      // Empecher de tout desactiver — au moins une metric doit rester
      const anyActive = Object.values(next).some(Boolean);
      if (!anyActive) return prev;
      return next;
    });
  };

  const onSort = (m: MetricKey) => {
    if (orderBy === m) {
      setOrderDir(orderDir === 'desc' ? 'asc' : 'desc');
    } else {
      setOrderBy(m);
      setOrderDir('desc');
    }
  };

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Aucun site configuré. Crée-en un via l&apos;API admin pour commencer.
        </p>
      </div>
    );
  }

  const currentSite = sites.find((s) => s.id === siteId);

  return (
    <div className="space-y-6" data-testid="gsc-dashboard">
      {/* Header : site selector + date range + search type */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          data-testid="site-selector"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain}
              {!s.gscAttached && ' (GSC non attachée)'}
            </option>
          ))}
        </select>

        <select
          value={rangeKey}
          onChange={(e) => setRangeKey(e.target.value)}
          data-testid="range-selector"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {DATE_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value as SearchType)}
          data-testid="searchtype-selector"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SEARCH_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              Type : {s.label}
            </option>
          ))}
        </select>

        <div className="ml-auto text-xs text-muted-foreground">
          {startDate} → {endDate}
          {loading && <span className="ml-2 animate-pulse">…</span>}
        </div>
      </div>

      <FiltersBar filters={filters} onChange={setFilters} />

      {currentSite && !currentSite.gscAttached && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Le site <strong>{currentSite.domain}</strong> n&apos;a pas de
          propriété Google Search Console attachée. Attache-la via{' '}
          <code className="rounded bg-black/30 px-1">
            PUT /api/admin/sites/{currentSite.id}/gsc
          </code>
          , puis lance un sync.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* 4 KPI tiles cliquables */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          metric="clicks"
          value={totals.clicks}
          active={activeMetrics.clicks}
          onToggle={() => toggleMetric('clicks')}
        />
        <KpiTile
          metric="impressions"
          value={totals.impressions}
          active={activeMetrics.impressions}
          onToggle={() => toggleMetric('impressions')}
        />
        <KpiTile
          metric="ctr"
          value={totals.ctr}
          active={activeMetrics.ctr}
          onToggle={() => toggleMetric('ctr')}
        />
        <KpiTile
          metric="position"
          value={totals.position}
          active={activeMetrics.position}
          onToggle={() => toggleMetric('position')}
        />
      </div>

      {/* Chart temporel multi-courbes */}
      <TimeSeriesChart series={seriesData} activeMetrics={activeMetrics} />

      {/* Onglets dimensions */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {MAIN_DIMENSIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setActiveTab(d)}
            data-testid={`tab-${d}`}
            className={cn(
              'relative rounded-t-md px-4 py-2 text-sm transition-colors',
              activeTab === d
                ? 'bg-card text-foreground border border-border border-b-card -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="mr-1">{DIMENSION_META[d].icon}</span>
            {DIMENSION_META[d].label}
          </button>
        ))}
      </div>

      {/* Table */}
      {activeTab === 'searchAppearance' ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Search appearance n&apos;est pas disponible dans le POC — cette
          dimension GSC requiert un type de requête structuré qui sera ajouté
          plus tard.
        </div>
      ) : (
        <GscDataTable
          rows={tabData?.rows ?? []}
          totalRows={tabData?.totalRows ?? 0}
          dimensionLabels={[DIMENSION_META[activeTab].label]}
          orderBy={orderBy}
          orderDir={orderDir}
          onSort={onSort}
          onPageChange={setCurrentPage}
          currentPage={currentPage}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
