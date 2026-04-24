import Link from 'next/link'
import { CheckCircle2, Clock, MapPin, Shield, Star } from 'lucide-react'
import { getPage, mediaUrl } from '@/lib/cms'

export const dynamic = 'force-static'

const FALLBACK_HERO_IMG = 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=80'

export default async function Home() {
  const page = await getPage('home')

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-neutral-900 text-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${mediaUrl(page?.heroImage ?? null, FALLBACK_HERO_IMG)})` }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-32 md:py-40">
          <div className="max-w-2xl">
            <span className="inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              Artisan certifié RGE
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              {page?.heroTitle ?? 'Dupont BTP, votre artisan maçon local'}
            </h1>
            <p className="mt-6 text-xl text-neutral-200">
              {page?.heroSubtitle ??
                'Maçonnerie, rénovation, extension — 35 ans d’expérience au service des particuliers et des pros.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-6 py-3 font-semibold hover:bg-brand-700"
              >
                Demander un devis
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-6 py-3 font-semibold backdrop-blur hover:bg-white/20"
              >
                Voir nos services
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* USPs */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-8 md:grid-cols-4">
          {[
            { icon: Shield, title: 'Garantie décennale', desc: 'Tous nos travaux sont couverts.' },
            { icon: Clock, title: 'Interventions rapides', desc: 'Devis sous 48h, chantier sous 2 semaines.' },
            { icon: MapPin, title: 'Local', desc: 'Basé à Lyon, mobile sur tout le Rhône.' },
            { icon: Star, title: '4,9/5 sur Google', desc: 'Plus de 200 avis clients vérifiés.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <Icon className="h-6 w-6 text-brand-600" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SERVICES TEASER */}
      <section className="bg-neutral-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold">Nos domaines d&apos;intervention</h2>
          <p className="mt-2 text-neutral-600">De la petite réparation au gros œuvre.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { title: 'Maçonnerie', desc: 'Murs, dalles, fondations, reprises en sous-œuvre.' },
              { title: 'Rénovation', desc: 'Mise aux normes, isolation, aménagement intérieur.' },
              { title: 'Extension', desc: 'Agrandissement maison, véranda, garage.' },
            ].map((s) => (
              <div key={s.title} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                <CheckCircle2 className="h-6 w-6 text-brand-600" />
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-neutral-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold">Un projet ? Parlons-en.</h2>
        <p className="mt-3 text-neutral-600">Déplacement gratuit, devis détaillé sous 48h.</p>
        <Link
          href="/contact"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-brand-600 px-8 py-4 text-lg font-semibold text-white hover:bg-brand-700"
        >
          Contactez-nous
        </Link>
      </section>
    </>
  )
}
