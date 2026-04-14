import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import {
  getUserTenantStatus,
  aggregateActiveServices,
  isServiceActive,
} from '@/lib/user-tenant';
import { LockedServicePage } from '@/components/locked-service-page';

// Force-dynamic : le call tracking peut etre active n'importe quand cote
// skill admin, et le user doit voir la page s'unlock au reload.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CallsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  const { cookies } = await import('next/headers');
  const cookieJar = await cookies();
  const asTenant = cookieJar.get('veridian_admin_as_tenant')?.value || null;
  const platformRole = (session.user as { platformRole?: string }).platformRole || null;
  const status = await getUserTenantStatus(session.user.email, {
    asTenantSlug: asTenant,
    requesterRole: platformRole,
  });
  const active = aggregateActiveServices(status);
  // Narrowing : si status est null, active est [] donc le guard trigger.
  // Le check explicite `!status` permet a TS de narrow pour la query plus bas.
  if (!status || !isServiceActive(active, 'calls')) {
    const domain = status?.sites[0]?.domain ?? '';
    return <LockedServicePage service="calls" siteDomain={domain} />;
  }

  let calls: Awaited<ReturnType<typeof prisma.sipCall.findMany>> = [];
  // Clics CTA : pageviews avec referrer qui commence par "cta:" (tel:, mailto:, boutons)
  let ctaClicks: Awaited<ReturnType<typeof prisma.pageview.findMany>> = [];
  let dbError: string | null = null;
  const siteIds = status.sites.map((s) => s.id);
  try {
    const [callsResult, ctaResult] = await Promise.all([
      prisma.sipCall.findMany({
        where: { site: { tenantId: status.tenant.id } },
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: { site: true },
      }),
      prisma.pageview.findMany({
        where: {
          siteId: { in: siteIds },
          referrer: { startsWith: 'cta:' },
          isBot: false,
          interacted: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    calls = callsResult;
    ctaClicks = ctaResult;
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'DB error';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Appels</h1>
        <p className="text-sm text-muted-foreground">
          {calls.length > 0
            ? `${calls.length} appel${calls.length > 1 ? 's' : ''} (50 derniers)`
            : 'Aucun appel enregistre. Configurez le call tracking pour commencer.'}
        </p>
      </div>

      {calls.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Les logs d&apos;appels sont poussés par le webhook OVH/Telnyx vers
              l&apos;API d&apos;ingestion.
            </p>
          </CardContent>
        </Card>
      )}

      {dbError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {dbError}
          </CardContent>
        </Card>
      )}

      {/* Section CTA clics — clics sur les numeros de telephone, emails, boutons */}
      <Card>
        <CardHeader>
          <CardTitle>
            Clics CTA
            {ctaClicks.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({ctaClicks.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ctaClicks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun clic CTA enregistre. Les clics sur les numeros de telephone,
              emails et boutons tagués <code>data-veridian-cta</code> apparaitront ici.
            </p>
          ) : (
            <div className="space-y-2">
              {ctaClicks.map((click) => {
                const ref = click.referrer || '';
                const isTel = ref.startsWith('cta:tel:');
                const isMailto = ref.startsWith('cta:mailto');
                const ctaName = ref.replace('cta:', '');
                return (
                  <div
                    key={click.id}
                    className="flex items-center gap-3 rounded border border-border/40 px-3 py-2 text-sm"
                  >
                    <span className="text-lg">
                      {isTel ? '📞' : isMailto ? '📧' : '👆'}
                    </span>
                    <div className="flex-1">
                      <span className="font-medium">
                        {isTel
                          ? ctaName.replace('tel:', '')
                          : isMailto
                            ? 'Email'
                            : ctaName}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        sur <span className="font-mono">{click.path}</span>
                      </span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {new Date(click.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      {new Date(click.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section SIP Calls — appels telephoniques reels */}
      {calls.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Appels telephoniques
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({calls.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">De</th>
                    <th className="pb-2">Vers</th>
                    <th className="pb-2">Direction</th>
                    <th className="pb-2">Statut</th>
                    <th className="pb-2">Duree</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {new Date(c.startedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        {new Date(c.startedAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 tabular-nums">{c.fromNum}</td>
                      <td className="py-2 tabular-nums">{c.toNum}</td>
                      <td className="py-2">
                        <span className={c.direction === 'inbound' ? 'text-emerald-500' : 'text-blue-500'}>
                          {c.direction === 'inbound' ? '↙ Entrant' : '↗ Sortant'}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={
                          c.status === 'answered' ? 'rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-500' :
                          c.status === 'missed' ? 'rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-500' :
                          'rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500'
                        }>
                          {c.status === 'answered' ? 'Repondu' : c.status === 'missed' ? 'Manque' : 'Messagerie'}
                        </span>
                      </td>
                      <td className="py-2 tabular-nums">
                        {Math.floor(c.duration / 60)}:{String(c.duration % 60).padStart(2, '0')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Shadow marketing SIP — propose de brancher un numero dedie */
        <Card className="border-dashed border-muted-foreground/20 bg-muted/5">
          <CardContent className="pt-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <span className="text-2xl">📱</span>
            </div>
            <h3 className="text-sm font-semibold text-muted-foreground">
              Mesurez precisement vos appels telephoniques
            </h3>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Branchez un numero SIP dedie Veridian pour savoir exactement combien
              d&apos;appels arrivent, lesquels sont manques, et depuis quelles pages
              vos visiteurs appellent. A partir de 15€/mois.
            </p>
            <a
              href="mailto:contact@veridian.site?subject=Call%20tracking%20SIP&body=Je%20souhaite%20activer%20le%20suivi%20des%20appels%20telephoniques%20pour%20mon%20site."
              className="mt-3 inline-block rounded bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20"
            >
              Activer le call tracking
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
