import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';

export default async function FormsPage() {
  let submissions: Awaited<
    ReturnType<typeof prisma.formSubmission.findMany>
  > = [];
  let dbError: string | null = null;
  try {
    submissions = await prisma.formSubmission.findMany({
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
          50 dernières soumissions reçues depuis les sites connectés.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comment intégrer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Sur ton site client, intercepte le submit et POST le payload vers :
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs text-foreground">
{`POST /api/ingest/form
Headers: x-site-key: <ton_site_key>
Body: { "formName": "contact", "payload": {...}, "path": "/contact" }`}
          </pre>
          <p>
            Le <code>siteKey</code> est visible dans{' '}
            <strong>(à venir) Paramètres → Sites</strong>.
          </p>
        </CardContent>
      </Card>

      {dbError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {dbError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dernières soumissions</CardTitle>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune soumission pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Site</th>
                    <th className="pb-2">Form</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Téléphone</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2">
                        {(s as typeof s & { site?: { domain: string } }).site
                          ?.domain ?? '—'}
                      </td>
                      <td className="py-2">{s.formName}</td>
                      <td className="py-2">{s.email ?? '—'}</td>
                      <td className="py-2">{s.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
