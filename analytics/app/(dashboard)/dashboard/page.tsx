import Link from 'next/link';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkline } from '@/components/sparkline';
import { getDashboardMetrics, type MetricCard } from '@/lib/metrics';
import { formatNumber, formatPercent, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let cards: MetricCard[] = [];
  let dbError: string | null = null;
  try {
    cards = await getDashboardMetrics();
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'DB error';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            30 derniers jours — trié par croissance. Les métriques qui montent
            le plus occupent plus de place.
          </p>
        </div>
        <div className="hidden text-xs text-muted-foreground md:block">
          comparé aux 30 jours précédents
        </div>
      </div>

      {dbError && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">DB error: {dbError}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Les tables tracking ne sont peut-être pas encore migrées — lance{' '}
              <code>pnpm exec prisma db push</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
        data-testid="metrics-grid"
      >
        {cards.map((c) => (
          <MetricWidget key={c.key} card={c} />
        ))}
      </div>

      {cards.length === 0 && !dbError && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Aucune donnée pour le moment. Configure un site dans{' '}
            <strong>Formulaires → Intégration</strong> et envoie quelques
            événements pour voir les métriques apparaître.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricWidget({ card }: { card: MetricCard }) {
  const positive = card.deltaPct >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  const span =
    card.weight === 2 ? 'lg:col-span-2 md:col-span-2' : 'col-span-1';
  const accentBorder = positive
    ? 'hover:border-emerald-400/50'
    : 'hover:border-rose-400/50';

  return (
    <Link
      href={card.href}
      className={cn('group', span)}
      data-testid={`metric-${card.key}`}
      data-weight={card.weight}
    >
      <Card
        className={cn(
          'h-full transition-colors hover:border-primary/50',
          accentBorder,
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 pt-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <div
              className="text-3xl font-semibold tabular-nums"
              data-testid={`metric-${card.key}-value`}
            >
              {formatNumber(card.value)}
            </div>
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                positive ? 'text-emerald-400' : 'text-rose-400',
              )}
              data-testid={`metric-${card.key}-delta`}
            >
              <Icon className="h-3 w-3" />
              {formatPercent(card.deltaPct, 1)}
            </div>
          </div>

          <div className="-mx-2 flex-1">
            <Sparkline
              data={card.sparkline}
              positive={positive}
              height={card.weight === 2 ? 60 : 40}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Précédent : {formatNumber(card.previous)}</span>
            <span>30j</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
