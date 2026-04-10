import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <main className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>
          Veridian Analytics
          <span className="badge">BETA</span>
        </h1>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <button type="submit" style={{ background: '#262626' }}>
            Déconnexion
          </button>
        </form>
      </header>

      <div className="card">
        <h2 style={{ marginBottom: '0.5rem' }}>Bienvenue {session.user.email}</h2>
        <p style={{ opacity: 0.7 }}>
          Dashboard en construction. Ici tu verras bientôt :
        </p>
        <ul style={{ marginTop: '1rem', paddingLeft: '1.5rem', opacity: 0.8, lineHeight: '1.8' }}>
          <li>Metrics Google Search Console de tes domaines</li>
          <li>Formulaires soumis sur tes sites vitrine</li>
          <li>Appels reçus (call tracking SIP)</li>
          <li>Top pages et conversions 30 jours</li>
        </ul>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '0.5rem' }}>Intégrations</h3>
        <p style={{ opacity: 0.7, fontSize: '0.875rem' }}>
          Aucune intégration configurée pour le moment. Viens bientôt : Google Search Console, tracker pageviews JS, upload CSV OVH call logs.
        </p>
      </div>
    </main>
  );
}
