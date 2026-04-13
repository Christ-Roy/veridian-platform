import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createRateLimiter } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateOtp, sendOtpEmail } from '@/lib/otp';

// 5 tentatives par minute par IP
const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

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
    const hdrs = await headers();
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      'unknown';

    if (!loginLimiter.check(ip)) {
      redirect('/login?error=rate-limit');
    }

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      redirect('/login?error=credentials');
    }

    // Vérifier credentials manuellement (sans signIn)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      redirect('/login?error=credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      redirect('/login?error=credentials');
    }

    const cb = formData.get('callbackUrl') as string || '/dashboard';

    // En test/CI (ENABLE_TEST_APIS=true), skip le 2FA — login direct
    if (process.env.ENABLE_TEST_APIS === 'true') {
      await signIn('credentials', {
        email,
        password,
        redirectTo: cb,
      });
      return;
    }

    // Credentials OK → générer OTP et envoyer par email
    const code = await generateOtp(email);
    await sendOtpEmail(email, code);

    // Rediriger vers la page de vérification
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(cb)}`,
    );
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
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
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
              {error === 'rate-limit' && (
                <p className="text-sm text-destructive">
                  Trop de tentatives. Réessayez dans une minute.
                </p>
              )}
              {error === 'credentials' && (
                <p className="text-sm text-destructive">
                  Identifiants invalides
                </p>
              )}
              {error && error !== 'rate-limit' && error !== 'credentials' && (
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
