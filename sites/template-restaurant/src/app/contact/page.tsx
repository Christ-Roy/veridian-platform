import { Phone, MapPin, Clock, Mail } from 'lucide-react'

export const dynamic = 'force-static'

export default function Contact() {
  return (
    <>
      <section className="border-b border-neutral-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="font-serif text-5xl font-bold">Réserver une table</h1>
          <p className="mt-4 max-w-2xl text-lg italic text-neutral-600">
            Ou tout simplement nous contacter.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-12 md:grid-cols-2">
          <div className="space-y-6">
            {[
              { icon: Phone, label: 'Téléphone', value: '04 00 00 00 00', href: 'tel:+33400000000' },
              { icon: Mail, label: 'Email', value: 'bonjour@bistro-alice.fr', href: 'mailto:bonjour@bistro-alice.fr' },
              { icon: MapPin, label: 'Adresse', value: '15 rue Mercière, 69002 Lyon' },
              { icon: Clock, label: 'Horaires', value: 'Mar–Sam · 12h–14h et 19h–22h' },
            ].map(({ icon: Icon, label, value, href }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <Icon className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
                  {href ? (
                    <a href={href} className="font-serif text-xl hover:text-brand-600">{value}</a>
                  ) : (
                    <div className="font-serif text-xl">{value}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="space-y-4 rounded-xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
            <h2 className="font-serif text-2xl font-bold">Réservation</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Nom</label>
                <input type="text" className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Téléphone</label>
                <input type="tel" className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Date</label>
                <input type="date" className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Couverts</label>
                <select className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600">
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n}>{n} personnes</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Message</label>
              <textarea rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
            </div>
            <button type="submit" className="w-full rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
              Envoyer la demande
            </button>
          </form>
        </div>
      </section>
    </>
  )
}
