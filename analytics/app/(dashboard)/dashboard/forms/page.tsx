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

// Force-dynamic : des que Robert ingere le premier form submit via le skill
// admin, le user voit la page s'unlock au prochain reload, pas de cache qui
// traine.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FormsPage() {
  // Guard service : on resout le tenant du user et on check si 'forms' est
  // actif. Si non, on affiche l'ecran plein "Verrouille + CTA mailto".
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  // Lire le cookie d'impersonation pour que Robert voie les forms du
  // tenant qu'il consulte depuis /admin (pas ceux de son propre tenant).
  const { cookies } = await import('next/headers');
  const cookieJar = await cookies();
  const asTenant = cookieJar.get('veridian_admin_as_tenant')?.value || null;
  const platformRole = (session.user as { platformRole?: string }).platformRole || null;
  const status = await getUserTenantStatus(session.user.email, {
    asTenantSlug: asTenant,
    requesterRole: platformRole,
  });
  const active = aggregateActiveServices(status);
  // Narrowing : si status est null, active est [] donc isServiceActive false.
  // Le check explicite `!status` permet a TS de narrow pour la query plus bas.
  if (!status || !isServiceActive(active, 'forms')) {
    const domain = status?.sites[0]?.domain ?? '';
    return <LockedServicePage service="forms" siteDomain={domain} />;
  }

  let submissions: Awaited<
    ReturnType<typeof prisma.formSubmission.findMany>
  > = [];
  let dbError: string | null = null;
  try {
    // Isolation tenant : filtre par la relation site.tenantId. status.tenant
    // vient de getUserTenantStatus (qui gere l'impersonation superadmin),
    // donc ce filtre suit automatiquement le contexte admin.
    submissions = await prisma.formSubmission.findMany({
      where: { site: { tenantId: status.tenant.id } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { site: true },
    });
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'DB error';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Formulaires</h1>
        <p className="text-sm text-muted-foreground">
          {submissions.length > 0
            ? `${submissions.length} soumission${submissions.length > 1 ? 's' : ''} recue${submissions.length > 1 ? 's' : ''} (50 dernieres)`
            : 'Aucune soumission pour le moment.'}
        </p>
      </div>

      {dbError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {dbError}
          </CardContent>
        </Card>
      )}

      {submissions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Comment integrer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Ajoutez le tracker sur votre site et taguez vos formulaires :</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs text-foreground">
{`<form data-veridian-track="contact">
  <input name="email" type="email" />
  <input name="phone" type="tel" />
  <textarea name="message"></textarea>
  <button type="submit">Envoyer</button>
</form>`}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => {
            const site = (s as typeof s & { site?: { domain: string } }).site;
            const payload = s.payload as Record<string, unknown> | null;
            return (
              <Card key={s.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      {/* Header : nom du formulaire + date */}
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {s.formName}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(s.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          a{' '}
                          {new Date(s.createdAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {site?.domain && (
                          <span className="text-xs text-muted-foreground">
                            — {site.domain}
                          </span>
                        )}
                      </div>

                      {/* Contact : email + telephone */}
                      <div className="flex flex-wrap gap-3 text-sm">
                        {s.email && (
                          <a
                            href={`mailto:${s.email}`}
                            className="text-primary hover:underline"
                          >
                            {s.email}
                          </a>
                        )}
                        {s.phone && (
                          <a
                            href={`tel:${s.phone}`}
                            className="text-primary hover:underline"
                          >
                            {s.phone}
                          </a>
                        )}
                      </div>

                      {/* Page d'origine */}
                      {s.path && (
                        <div className="text-xs text-muted-foreground">
                          Page : <span className="font-mono">{s.path}</span>
                        </div>
                      )}

                      {/* UTM source */}
                      {s.utmSource && (
                        <div className="text-xs text-muted-foreground">
                          Source : <span className="font-mono">{s.utmSource}</span>
                        </div>
                      )}

                      {/* Payload complet — tous les champs du formulaire */}
                      {payload && Object.keys(payload).length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            Voir tous les champs ({Object.keys(payload).length})
                          </summary>
                          <div className="mt-1 rounded bg-muted p-2 text-xs">
                            <table className="w-full">
                              <tbody>
                                {Object.entries(payload).map(([k, v]) => (
                                  <tr key={k} className="border-b border-border/30 last:border-0">
                                    <td className="py-1 pr-3 font-mono text-muted-foreground align-top">
                                      {k}
                                    </td>
                                    <td className="py-1 break-all">
                                      {String(v ?? '')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
