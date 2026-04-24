import { Hammer, Home, Trees, Wrench, Paintbrush, Building2 } from 'lucide-react'

export const dynamic = 'force-static'

const services = [
  { icon: Hammer, title: 'Maçonnerie', desc: 'Murs, dalles, fondations, reprises en sous-œuvre.' },
  { icon: Home, title: 'Rénovation complète', desc: 'Mise aux normes, isolation, aménagement intérieur.' },
  { icon: Building2, title: 'Extension', desc: 'Agrandissement maison, véranda, garage.' },
  { icon: Paintbrush, title: 'Enduits & façades', desc: 'Ravalement, enduits extérieurs, isolation thermique.' },
  { icon: Wrench, title: 'Petites réparations', desc: 'Dépannage urgent, interventions rapides.' },
  { icon: Trees, title: 'Aménagement extérieur', desc: 'Terrasses, allées, murets, piscines.' },
]

export default function Services() {
  return (
    <>
      <section className="border-b border-neutral-200 bg-neutral-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="text-4xl font-bold md:text-5xl">Nos services</h1>
          <p className="mt-4 max-w-2xl text-lg text-neutral-600">
            De la petite réparation au chantier complet, nous intervenons avec le même sérieux.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border border-neutral-200 bg-white p-6 transition hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50">
                <Icon className="h-6 w-6 text-brand-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
