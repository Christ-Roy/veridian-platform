import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo Analytics SAS - Votre partenaire digital",
  description:
    "Agence de consulting digital specialisee en SEO, publicite en ligne et creation de sites web.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // URL du tracker Analytics — en prod ce sera https://analytics.app.veridian.site
  // Pour le dev/test, on pointe vers le dev-server Tailscale.
  const analyticsUrl =
    process.env.NEXT_PUBLIC_ANALYTICS_URL || "http://100.92.215.42:3100";
  // Site-key du tenant demo-analytics (provisionnee via le skill)
  const siteKey =
    process.env.NEXT_PUBLIC_ANALYTICS_SITE_KEY || "cmnw81obc0006ttfos0eefjtc";

  return (
    <html lang="fr">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#16a34a" />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {/* Navigation */}
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/" className="text-xl font-bold text-veridian-700">
              Demo Analytics
            </a>
            <div className="flex items-center gap-6 text-sm">
              <a href="/" className="hover:text-veridian-600">
                Accueil
              </a>
              <a href="/contact" className="hover:text-veridian-600">
                Contact
              </a>
              <a
                href="tel:+33482530429"
                className="rounded-md bg-veridian-600 px-4 py-2 text-white hover:bg-veridian-700"
              >
                04 82 53 04 29
              </a>
            </div>
          </div>
        </nav>

        {children}

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-gray-50 py-8">
          <div className="mx-auto max-w-5xl px-6 text-center text-sm text-gray-500">
            <p>
              Demo Analytics SAS &mdash; Site de demonstration
            </p>
            <p className="mt-1">
              Propulse par{" "}
              <a
                href="https://veridian.site"
                className="text-veridian-600 hover:underline"
              >
                Veridian
              </a>
            </p>
          </div>
        </footer>

        {/* Tracker Veridian Analytics */}
        <Script
          src={`${analyticsUrl}/tracker.js`}
          data-site-key={siteKey}
          data-veridian-track="auto"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
