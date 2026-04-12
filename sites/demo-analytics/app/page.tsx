export default function Home() {
  return (
    <main>
      {/* Bouton d'installation PWA — rendu visible par pwa-install.js */}
      <button
        data-veridian-install
        hidden
        className="fixed bottom-4 right-4 z-50 rounded-lg bg-veridian-600 px-4 py-2 text-white shadow-lg hover:bg-veridian-700 font-medium text-sm"
      >
        Installer l&apos;app
      </button>

      {/* Hero */}
      <section className="bg-gradient-to-b from-veridian-50 to-white py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Demo Analytics
          </h1>
          <p className="mt-2 text-lg text-veridian-700 font-medium">
            Votre partenaire digital
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Nous accompagnons les PME dans leur transformation numerique :
            referencement, publicite en ligne et creation de sites performants.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <a
              href="/contact"
              className="rounded-md bg-veridian-600 px-6 py-3 text-white font-medium hover:bg-veridian-700"
            >
              Demander un devis
            </a>
            <a
              href="tel:+33482530429"
              className="rounded-md border border-veridian-600 px-6 py-3 text-veridian-700 font-medium hover:bg-veridian-50"
            >
              04 82 53 04 29
            </a>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900">
            Nos services
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-veridian-700">SEO</h3>
              <p className="mt-2 text-sm text-gray-600">
                Positionnez votre entreprise en premiere page de Google.
                Audit technique, contenu optimise, netlinking.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-veridian-700">
                Publicite en ligne
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Campagnes Google Ads et Meta Ads avec un ROI mesurable.
                Tracking precis de chaque euro investi.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-veridian-700">
                Sites web
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Sites vitrines rapides et modernes. Optimises pour le mobile,
                le SEO et la conversion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* A propos */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold text-gray-900">A propos</h2>
          <p className="mt-4 max-w-3xl text-gray-600">
            Demo Analytics SAS est une agence fictive creee pour tester la
            plateforme Veridian Analytics. Ce site simule un vrai site client
            avec tracker, formulaires et call tracking.
          </p>
          <p className="mt-2 max-w-3xl text-gray-600">
            Chaque visite, chaque clic sur le numero de telephone et chaque
            formulaire soumis est trace et visible dans le dashboard Analytics.
          </p>
        </div>
      </section>

      {/* Contact rapide */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Un projet ? Parlons-en.
          </h2>
          <p className="mt-4 text-gray-600">
            Appelez-nous ou remplissez le formulaire de contact.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <a
              href="tel:+33482530429"
              className="rounded-md bg-veridian-600 px-6 py-3 text-white font-medium hover:bg-veridian-700"
            >
              04 82 53 04 29
            </a>
            <a
              href="/contact"
              className="rounded-md border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-50"
            >
              Formulaire de contact
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
