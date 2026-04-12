import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { ShadowMarketingBlock } from '@/components/shadow-marketing-block';
import {
  ServiceScoreBlock,
  type ServiceMetric,
} from '@/components/service-score-block';
import { getUserTenantStatus, computeScore, scoreLabel } from '@/lib/user-tenant';
import { KNOWN_SERVICES, type ServiceKey } from '@/lib/tenant-status';
import { isSuperadmin } from '@/lib/admin-guard';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { cn } from '@/lib/utils';

// On ne veut AUCUN cache Next ici : chaque reload doit refleter l'etat
// courant de la DB (Robert provisionne via le skill pendant que le client
// regarde son dashboard — la donnee doit apparaitre en live).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Page d'accueil client :
 *   - Score Veridian global en haut (somme ponderee des services actifs)
 *   - Grille qui mixe services actifs (ServiceScoreBlock) et inactifs
 *     (ShadowMarketingBlock), dans l'ordre canonique KNOWN_SERVICES
 *   - Ordre de rendu : actifs d'abord, inactifs ensuite (toujours dans
 *     l'ordre canonique pageviews > forms > calls > gsc > ads > pagespeed)
 *
 * Strategie de fetch : on appelle `buildTenantStatus()` directement en
 * server component pour eviter un round-trip HTTP vers /api/admin (qui
 * exige la clef admin de toute facon) et pour beneficier du rendering
 * React streaming.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ asTenant?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  const params = searchParams ? await searchParams : {};
  const role = (session.user as { role?: string }).role;
  const canImpersonate = !!params.asTenant && isSuperadmin(session);
  const asTenantSlug = canImpersonate ? (params.asTenant ?? null) : null;

  let status = null;
  let dbError: string | null = null;
  try {
    status = await getUserTenantStatus(session.user.email, {
      asTenantSlug,
      requesterRole: role,
    });
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'DB error';
  }

  if (dbError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Mon dashboard Veridian</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">DB error: {dbError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status || status.sites.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Mon dashboard Veridian</h1>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Votre compte n&apos;a pas encore de site rattache. Contactez{' '}
            <a
              className="text-primary hover:underline"
              href="mailto:contact@veridian.site"
            >
              contact@veridian.site
            </a>{' '}
            pour lancer votre dashboard.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pour le MVP, on affiche le premier site du tenant. Un client a 1 site
  // dans 99% des cas. On ajoutera un selecteur multi-site plus tard si besoin.
  const site = status.sites[0];
  const { score, active, total } = computeScore(site.activeServices);
  const label = scoreLabel(score);

  // On trie les services dans l'ordre canonique, mais on met les actifs
  // avant les inactifs pour que le client voie sa valeur en premier.
  const ordered: Array<{ key: ServiceKey; active: boolean }> = [
    ...KNOWN_SERVICES.filter((s) => site.activeServices.includes(s)).map(
      (s) => ({ key: s, active: true }),
    ),
    ...KNOWN_SERVICES.filter((s) => !site.activeServices.includes(s)).map(
      (s) => ({ key: s, active: false }),
    ),
  ];

  // Mini "metric" synthetique pour chaque service actif. Pour le MVP, on
  // utilise les counts 28j de buildTenantStatus et on met une tendance a 0
  // (on n'a pas encore de comparaison periode precedente au niveau site —
  // ce sera l'evolution naturelle du lib quand on en aura besoin).
  function metricFor(s: ServiceKey): ServiceMetric {
    const c = site.counts28d;
    const valueMap: Record<ServiceKey, number> = {
      pageviews: c.pageviews,
      forms: c.formSubmissions,
      calls: c.sipCalls,
      gsc: c.gscClicks,
      ads: 0,
      pagespeed: 0,
    };
    return {
      value: valueMap[s] ?? 0,
      previous: 0,
      deltaPct: 0,
    };
  }

  return (
    <div className="space-y-8">
      {canImpersonate && status && (
        <ImpersonationBanner
          tenantName={status.tenant.name}
          tenantSlug={status.tenant.slug}
        />
      )}
      {/* Header + score global */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mon dashboard Veridian</h1>
          <p className="text-sm text-muted-foreground">
            {site.name}
            {' — '}
            <span className="text-muted-foreground/70">{site.domain}</span>
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          Beta
        </span>
      </div>

      <ScoreCard
        score={score}
        label={label.label}
        tone={label.tone}
        active={active}
        total={total}
      />

      {/* Grille : actifs puis inactifs, ordre canonique */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Vos services
        </h2>
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          data-testid="services-grid"
        >
          {ordered.map(({ key, active }) =>
            active ? (
              <ServiceScoreBlock
                key={key}
                service={key}
                metric={metricFor(key)}
              />
            ) : (
              <ShadowMarketingBlock
                key={key}
                service={key}
                siteDomain={site.domain}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Carte "score Veridian" au top de la page. Visuellement dominante mais
 * pas criarde — bar de progression + label qualitatif + compteur services.
 */
function ScoreCard({
  score,
  label,
  tone,
  active,
  total,
}: {
  score: number;
  label: string;
  tone: 'great' | 'good' | 'fair' | 'low';
  active: number;
  total: number;
}) {
  const toneColor = {
    great: 'text-emerald-400',
    good: 'text-emerald-300',
    fair: 'text-amber-300',
    low: 'text-rose-300',
  }[tone];

  const barColor = {
    great: 'bg-emerald-400',
    good: 'bg-emerald-300',
    fair: 'bg-amber-300',
    low: 'bg-rose-300',
  }[tone];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:gap-8">
        <div className="flex items-baseline gap-3">
          <div
            className={cn('text-5xl font-semibold tabular-nums', toneColor)}
            data-testid="score-value"
          >
            {score}
          </div>
          <div className="text-sm text-muted-foreground">/ 100</div>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Score Veridian — <span className={toneColor}>{label}</span>
            </span>
            <span data-testid="score-services-count">
              {active} / {total} services actifs
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/40">
            <div
              className={cn('h-full transition-all', barColor)}
              style={{ width: `${score}%` }}
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Votre score reflete les services Veridian actuellement actifs sur
            votre site. Plus de services actifs = meilleur suivi de votre
            performance digitale.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
