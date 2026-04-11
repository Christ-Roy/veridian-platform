'use client';

import { cn } from '@/lib/utils';
import { METRIC_META, type MetricKey } from './types';

/**
 * Tuile KPI comme dans GSC Performance : grand chiffre + couleur de la metric.
 * Cliquable pour activer/desactiver la courbe correspondante sur le graphique.
 */
export function KpiTile({
  metric,
  value,
  active,
  onToggle,
}: {
  metric: MetricKey;
  value: number;
  active: boolean;
  onToggle: () => void;
}) {
  const meta = METRIC_META[metric];
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={`kpi-${metric}`}
      data-active={active}
      className={cn(
        'group relative flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left transition-all',
        'hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'ring-2 ring-offset-2 ring-offset-background' : 'opacity-60',
      )}
      style={{
        ['--tw-ring-color' as string]: active ? meta.color : 'transparent',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: meta.color }}
        />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
      </div>
      <div
        className="text-3xl font-semibold tabular-nums"
        style={{ color: active ? meta.color : undefined }}
      >
        {meta.format(value)}
      </div>
    </button>
  );
}
