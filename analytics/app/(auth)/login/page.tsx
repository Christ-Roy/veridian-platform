import { signIn } from '@/auth';

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
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: callbackUrl,
      });
    } catch (err) {
      throw err;
    }
  }

  return (
    <main className="container">
      <div style={{ maxWidth: '400px', margin: '4rem auto' }}>
        <h1 style={{ marginBottom: '2rem' }}>
          Veridian Analytics
          <span className="badge">BETA</span>
        </h1>
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Connexion</h2>
          <form action={login}>
            <input name="email" type="email" placeholder="email@example.com" required />
            <input name="password" type="password" placeholder="mot de passe" required />
            <button type="submit" style={{ width: '100%', marginTop: '0.5rem' }}>
              Se connecter
            </button>
            {error && <p className="error">Identifiants invalides</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
