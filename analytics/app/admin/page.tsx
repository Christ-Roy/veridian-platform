import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isSuperadmin } from '@/lib/admin-guard';
import { listAllTenantsStatus, KNOWN_SERVICES } from '@/lib/tenant-status';
import { computeScore, scoreLabel } from '@/lib/user-tenant';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  rotateSiteKeyAction,
  syncGscAction,
  sendMagicLinkAction,
  sendPushNotifyAction,
} from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Console /admin — liste de tous les tenants + actions superadmin.
 *
 * Visibilite : uniquement pour user.role === 'SUPERADMIN'. Le guard est
 * dans le layout, on le re-verifie ici en defense en profondeur.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login?callbackUrl=/admin');
  if (!isSuperadmin(session)) redirect('/dashboard');

  let tenants = [] as Awaited<ReturnType<typeof listAllTenantsStatus>>;
  let err: string | null = null;
  try {
    tenants = await listAllTenantsStatus();
  } catch (e) {
    err = e instanceof Error ? e.message : 'db error';
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Console plateforme</h1>
          <p className="text-sm text-muted-foreground">
            {tenants.length} tenant{tenants.length > 1 ? 's' : ''} actif
            {tenants.length > 1 ? 's' : ''} — connecte en tant que{' '}
            <span className="font-mono">{session.user.email}</span>
          </p>
        </div>
      </header>

      {err && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            DB error: {err}
          </CardContent>
        </Card>
      )}

      {!err && tenants.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Aucun tenant actif. Utilise le skill analytics-provision pour en
            creer un.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {tenants.map((t) => (
          <TenantCard key={t.tenant.id} tenant={t} />
        ))}
      </div>
    </div>
  );
}

/**
 * Card tenant — un bloc par tenant avec score, services, sites et actions.
 * Pas de state client : toutes les actions sont des server actions
 * (bindees via <form action={}>) donc la page reste 100% server component.
 */
function TenantCard({
  tenant,
}: {
  tenant: Awaited<ReturnType<typeof listAllTenantsStatus>>[number];
}) {
  // Score agrégé : union des services actifs de tous les sites du tenant
  const activeSet = new Set<string>();
  for (const s of tenant.sites) {
    for (const k of s.activeServices) activeSet.add(k);
  }
  const active = [...activeSet];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { score } = computeScore(active as any);
  const label = scoreLabel(score);

  const toneColor = {
    great: 'text-emerald-400',
    good: 'text-emerald-300',
    fair: 'text-amber-300',
    low: 'text-rose-300',
  }[label.tone];

  // Wrapper typage-compatible : form action attend `void | Promise<void>`
  // tandis que sendMagicLinkAction return un objet de status. On ignore
  // explicitement le return value ici — les erreurs sont loggees et une
  // revalidation de /admin sera declenchee au prochain reload.
  async function sendMagic(formData: FormData): Promise<void> {
    'use server';
    await sendMagicLinkAction(formData);
  }

  return (
    <Card data-testid="admin-tenant-card" data-tenant-slug={tenant.tenant.slug}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{tenant.tenant.name}</h2>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                {tenant.tenant.slug}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {tenant.tenant.members.length} membre
              {tenant.tenant.members.length > 1 ? 's' : ''}
              {' — '}
              {tenant.sites.length} site
              {tenant.sites.length > 1 ? 's' : ''}
              {' — cree '}
              {new Date(tenant.tenant.createdAt).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={cn('text-2xl font-semibold tabular-nums', toneColor)}>
              {score}
              <span className="text-sm text-muted-foreground"> / 100</span>
            </div>
            <span className={cn('text-xs', toneColor)}>{label.label}</span>
          </div>
        </div>

        {/* Services actifs : chips colorees */}
        <div className="flex flex-wrap gap-1.5">
          {KNOWN_SERVICES.map((svc) => {
            const isActive = active.includes(svc);
            return (
              <span
                key={svc}
                data-testid={`admin-service-${svc}`}
                data-active={isActive ? 'true' : 'false'}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  isActive
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-muted-foreground/20 text-muted-foreground/50 line-through',
                )}
              >
                {svc}
              </span>
            );
          })}
        </div>

        {/* Sites du tenant */}
        {tenant.sites.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Sites
            </h3>
            {tenant.sites.map((site) => (
              <div
                key={site.id}
                className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs"
              >
                <div className="flex-1">
                  <div className="font-medium">{site.name}</div>
                  <div className="font-mono text-muted-foreground">
                    {site.domain}
                  </div>
                </div>
                <div className="text-right text-muted-foreground">
                  <div>
                    {site.counts28d.pageviews.toLocaleString('fr-FR')} pv
                  </div>
                  <div>{site.counts28d.gscClicks.toLocaleString('fr-FR')} clicks</div>
                </div>
                <form
                  action={async () => {
                    'use server';
                    await rotateSiteKeyAction(site.id);
                  }}
                >
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    data-testid={`rotate-key-${site.id}`}
                  >
                    Rotate key
                  </Button>
                </form>
                {site.gsc && (
                  <form
                    action={async () => {
                      'use server';
                      await syncGscAction(site.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      data-testid={`sync-gsc-${site.id}`}
                    >
                      Sync GSC
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Notifications push */}
        <div className="space-y-2 border-t border-border/40 pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>📢</span> Notifications push
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              {tenant.pushSubscriptionsCount} device{tenant.pushSubscriptionsCount !== 1 ? 's' : ''}
            </span>
          </h3>
          <form
            action={async (formData: FormData) => {
              'use server';
              await sendPushNotifyAction(formData);
            }}
            className="space-y-1.5"
          >
            <input type="hidden" name="tenantId" value={tenant.tenant.id} />
            <input
              name="title"
              placeholder="Titre de la notification"
              required
              className="w-full rounded border border-border/40 bg-muted/20 px-3 py-1.5 text-xs placeholder:text-muted-foreground/50"
            />
            <textarea
              name="body"
              placeholder="Corps du message"
              required
              rows={2}
              className="w-full rounded border border-border/40 bg-muted/20 px-3 py-1.5 text-xs placeholder:text-muted-foreground/50"
            />
            <input
              name="url"
              placeholder="Lien (optionnel, ex: /dashboard/gsc)"
              className="w-full rounded border border-border/40 bg-muted/20 px-3 py-1.5 text-xs placeholder:text-muted-foreground/50"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-7 px-3 text-[10px]"
              data-testid={`push-notify-${tenant.tenant.slug}`}
              disabled={tenant.pushSubscriptionsCount === 0}
            >
              Envoyer la notification
            </Button>
          </form>
        </div>

        {/* Actions tenant-wide */}
        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Link
            href={`/dashboard?asTenant=${encodeURIComponent(tenant.tenant.slug)}`}
            data-testid={`open-dashboard-${tenant.tenant.slug}`}
          >
            <Button variant="default" className="h-8 text-xs">
              Ouvrir le dashboard client
            </Button>
          </Link>
          <form action={sendMagic}>
            <input type="hidden" name="tenantId" value={tenant.tenant.id} />
            <Button
              type="submit"
              variant="outline"
              className="h-8 text-xs"
              data-testid={`send-magic-${tenant.tenant.slug}`}
            >
              Envoyer magic link
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
