import { signIn } from '@/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const callbackUrl = params.callbackUrl || '/dashboard';

  async function login(formData: FormData) {
    'use server';
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: callbackUrl,
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="h-7 w-7 rounded bg-primary" />
          <h1 className="text-lg font-semibold">Veridian Analytics</h1>
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
            BETA
          </span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">
              Connexion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={login} className="space-y-3">
              <input
                name="email"
                type="email"
                placeholder="email@example.com"
                required
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                name="password"
                type="password"
                placeholder="mot de passe"
                required
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" className="w-full">
                Se connecter
              </Button>
              {error && (
                <p className="text-sm text-destructive">
                  Identifiants invalides
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
