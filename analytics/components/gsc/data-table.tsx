'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  METRIC_META,
  type MetricKey,
  type QueryResponse,
} from './types';

/**
 * Table de resultats facon GSC : colonne(s) dimension + 4 colonnes metriques,
 * triable par chaque colonne, avec pagination.
 */
export function GscDataTable({
  rows,
  totalRows,
  dimensionLabels,
  orderBy,
  orderDir,
  onSort,
  onPageChange,
  currentPage,
  pageSize,
}: {
  rows: QueryResponse['rows'];
  totalRows: number;
  dimensionLabels: string[];
  orderBy: MetricKey;
  orderDir: 'asc' | 'desc';
  onSort: (metric: MetricKey) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const [query, setQuery] = useState('');

  // Filtre en clair (cote client, purement visuel sur la page courante)
  const visible = query
    ? rows.filter((r) =>
        r.keys.some((k) =>
          k.toLowerCase().includes(query.toLowerCase()),
        ),
      )
    : rows;

  const sortIcon = (m: MetricKey) => {
    if (orderBy !== m) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return orderDir === 'desc' ? (
      <ArrowDown className="h-3 w-3" />
    ) : (
      <ArrowUp className="h-3 w-3" />
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border p-3">
        <input
          placeholder="Filtrer la vue..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {rows.length} / {totalRows} lignes
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              {dimensionLabels.map((d) => (
                <th
                  key={d}
                  className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground px-4 py-2"
                >
                  {d}
                </th>
              ))}
              {(['clicks', 'impressions', 'ctr', 'position'] as MetricKey[]).map(
                (m) => (
                  <th
                    key={m}
                    className="px-4 py-2 text-right"
                    style={{ minWidth: 110 }}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(m)}
                      data-testid={`sort-${m}`}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground',
                        orderBy === m && 'text-foreground',
                      )}
                    >
                      {METRIC_META[m].label}
                      {sortIcon(m)}
                    </button>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={dimensionLabels.length + 4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Pas de données.
                </td>
              </tr>
            ) : (
              visible.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-border hover:bg-muted/20"
                  data-testid={`row-${i}`}
                >
                  {r.keys.map((k, ki) => (
                    <td
                      key={ki}
                      className="px-4 py-2 max-w-md truncate text-foreground"
                      title={k}
                    >
                      {k || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {METRIC_META.clicks.format(r.clicks)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {METRIC_META.impressions.format(r.impressions)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {METRIC_META.ctr.format(r.ctr)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {METRIC_META.position.format(r.position)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs">
          <span className="text-muted-foreground">
            Page {currentPage + 1} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => onPageChange(currentPage - 1)}
              className="h-7 rounded border border-border px-3 hover:bg-muted disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => onPageChange(currentPage + 1)}
              className="h-7 rounded border border-border px-3 hover:bg-muted disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
