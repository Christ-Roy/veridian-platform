/**
 * Layout de la page /test-pwa — guard server-side.
 *
 * La page n'est visible que si ENABLE_TEST_APIS=true (meme guard que les
 * routes /api/test/*). En production le Dockerfile ne definit jamais cette
 * variable, donc la page est invisible par defaut.
 */
export default function TestPwaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.ENABLE_TEST_APIS !== 'true') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Page de test non disponible en production.
      </div>
    );
  }

  return <>{children}</>;
}
