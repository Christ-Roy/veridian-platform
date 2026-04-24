import Link from 'next/link'
import { Leaf, Award, Clock, ChefHat } from 'lucide-react'
import { getPage, mediaUrl } from '@/lib/cms'

export const dynamic = 'force-static'

const FALLBACK_HERO = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80'

export default async function Home() {
  const page = await getPage('home')

  return (
    <>
      {/* HERO */}
      <section className="relative min-h-[80vh] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${mediaUrl(page?.heroImage ?? null, FALLBACK_HERO)})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="relative mx-auto flex min-h-[80vh] max-w-6xl items-end px-4 pb-20 pt-32">
          <div className="max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-600/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              Cuisine française · Lyon 2ᵉ
            </span>
            <h1 className="mt-4 font-serif text-5xl font-bold md:text-7xl">
              {page?.heroTitle ?? 'Le Bistro d\'Alice'}
            </h1>
            <p className="mt-4 text-xl text-white/90">
              {page?.heroSubtitle ??
                'Une cuisine de saison, généreuse et précise, dans un cadre intime rue Mercière.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-full bg-brand-600 px-6 py-3 font-semibold hover:bg-brand-700">
                Réserver une table
              </Link>
              <Link href="/menu" className="rounded-full border border-white/40 bg-white/10 px-6 py-3 font-semibold backdrop-blur hover:bg-white/20">
                Découvrir la carte
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-10 md:grid-cols-4">
          {[
            { icon: Leaf, title: 'Produits de saison', desc: 'Carte renouvelée tous les mois.' },
            { icon: Award, title: 'Maître Restaurateur', desc: 'Titre officiel depuis 2018.' },
            { icon: ChefHat, title: 'Fait maison', desc: 'Du pain au dessert, tout est fait ici.' },
            { icon: Clock, title: 'Service soigné', desc: 'Ouvert midi et soir du mardi au samedi.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <Icon className="h-6 w-6 text-brand-600" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STORY */}
      <section className="border-y border-neutral-200 bg-white py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="font-serif text-4xl font-bold">Une cuisine de caractère</h2>
          <p className="mt-6 text-lg leading-relaxed text-neutral-700">
            Depuis 2015, Alice propose une cuisine française revisitée, fondée sur les
            produits du marché et les circuits courts. Chaque plat raconte une saison,
            un producteur, une rencontre. Bienvenue chez nous.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="font-serif text-4xl font-bold">Envie de passer à table ?</h2>
        <p className="mt-3 text-neutral-600">Nous vous recommandons de réserver — le bistro se remplit vite.</p>
        <Link href="/contact" className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white hover:bg-brand-700">
          Réserver maintenant
        </Link>
      </section>
    </>
  )
}
