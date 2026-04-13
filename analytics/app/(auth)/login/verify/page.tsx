import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { verifyOtp } from '@/lib/otp';
import { prisma } from '@/lib/prisma';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    callbackUrl?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const email = params.email;
  const callbackUrl = params.callbackUrl || '/dashboard';
  const error = params.error;

  if (!email) {
    redirect('/login');
  }

  // Masquer l'email partiellement pour l'affichage
  const parts = email.split('@');
  const masked =
    parts[0].slice(0, 2) +
    '***@' +
    parts[1];

  async function verify(formData: FormData) {
    'use server';
    const code = formData.get('code') as string;
    const emailVal = formData.get('email') as string;
    const cb = formData.get('callbackUrl') as string || '/dashboard';

    if (!code || !emailVal) {
      redirect(
        `/login/verify?email=${encodeURIComponent(emailVal || '')}&callbackUrl=${encodeURIComponent(cb)}&error=invalid`,
      );
    }

    const valid = await verifyOtp(emailVal, code.trim());
    if (!valid) {
      redirect(
        `/login/verify?email=${encodeURIComponent(emailVal)}&callbackUrl=${encodeURIComponent(cb)}&error=invalid`,
      );
    }

    // OTP valide — récupérer le user pour le signIn.
    // On a déjà vérifié le mot de passe en step 1, et le OTP prouve que
    // l'user a accès à l'email. On utilise un mécanisme de bypass :
    // on set un flag temporaire en DB et on signe avec un token interne.
    //
    // Approche simple : on utilise signIn credentials avec un token OTP
    // vérifié comme "password". Pour ça, on set temporairement un
    // passwordHash connu, signIn, puis on restore. Trop hackish.
    //
    // Mieux : on crée une session directement. Mais Auth.js credentials
    // ne supporte pas ça facilement.
    //
    // Approche la plus simple et sûre : on re-vérifie le password en
    // le passant dans un champ hidden. Mais on ne veut pas faire transiter
    // le mdp dans l'URL.
    //
    // Solution retenue : on stocke un "otp-verified" token one-shot dans
    // VerificationToken, et le authorize() callback dans auth.ts accepte
    // ce token comme alternative au password.
    const { createOtpVerifiedToken } = await import('@/lib/otp');
    const otpToken = await createOtpVerifiedToken(emailVal);

    await signIn('credentials', {
      email: emailVal,
      password: `otp-verified:${otpToken}`,
      redirectTo: cb,
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
              Vérification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Un code à 6 chiffres a été envoyé à <strong>{masked}</strong>.
            </p>
            <form action={verify} className="space-y-3">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <input
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                required
                autoFocus
                autoComplete="one-time-code"
                className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-center text-2xl font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" className="w-full">
                Vérifier
              </Button>
              {error === 'invalid' && (
                <p className="text-sm text-destructive">
                  Code invalide ou expiré. Réessayez.
                </p>
              )}
            </form>
            <p className="mt-4 text-xs text-muted-foreground">
              Le code expire dans 10 minutes.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
