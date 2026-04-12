import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { setPasswordAndLoginAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Page /welcome — point d'atterrissage apres click sur un magic link.
 *
 * Flow :
 *   1. URL : /welcome?token=<raw>&email=<email>
 *   2. On ne valide PAS le token ici (server action le fait) — on affiche
 *      juste un formulaire qui pre-remplit l'email et demande un password.
 *   3. Le submit appelle setPasswordAndLoginAction qui :
 *      - consume le token (atomique, one-shot)
 *      - set/update le password de l'user
 *      - signIn credentials (session 9 mois via auth.config.maxAge)
 *      - redirect /dashboard
 *
 * Securite :
 *   - Le token est invalide apres usage (consumeMagicLink delete la row)
 *   - Expiration 24h cote creation
 *   - Si le token est invalide, la server action throw — on affiche le
 *     message d'erreur via searchParams.error
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    email?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const token = params.token || '';
  const email = params.email || '';
  const error = params.error;

  if (!token || !email) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-base">Lien invalide</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Le lien magic ne contient pas toutes les informations necessaires.
            Demandez a Robert un nouveau lien.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="h-7 w-7 rounded bg-primary" />
          <h1 className="text-lg font-semibold">Veridian Analytics</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">
              Bienvenue
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Choisissez un mot de passe pour acceder a votre dashboard.
              Vous resterez connecte pendant 9 mois.
            </p>
          </CardHeader>
          <CardContent>
            <form
              action={setPasswordAndLoginAction}
              className="space-y-3"
              data-testid="welcome-form"
            >
              <input type="hidden" name="token" value={token} />
              <input
                name="email"
                type="email"
                value={email}
                readOnly
                className="h-9 w-full rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
              />
              <input
                name="password"
                type="password"
                placeholder="Mot de passe (6 caracteres min)"
                required
                minLength={6}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" className="w-full">
                Acceder au dashboard
              </Button>
              {error && (
                <p
                  className="text-sm text-destructive"
                  data-testid="welcome-error"
                >
                  {error === 'invalid'
                    ? 'Lien invalide ou deja utilise'
                    : error === 'expired'
                      ? 'Ce lien a expire (valable 24h). Demandez a Robert un nouveau lien.'
                      : 'Erreur inattendue, reessayez.'}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
