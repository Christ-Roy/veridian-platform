import { Phone, Mail, MapPin, Clock } from 'lucide-react'

export const dynamic = 'force-static'

export default function Contact() {
  return (
    <>
      <section className="border-b border-neutral-200 bg-neutral-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="text-4xl font-bold md:text-5xl">Contactez-nous</h1>
          <p className="mt-4 max-w-2xl text-lg text-neutral-600">
            Un projet, une question ? Nous vous répondons sous 24h.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-12 md:grid-cols-2">
          <div className="space-y-6">
            {[
              { icon: Phone, label: 'Téléphone', value: '04 00 00 00 00', href: 'tel:+33400000000' },
              { icon: Mail, label: 'Email', value: 'contact@dupont-btp.fr', href: 'mailto:contact@dupont-btp.fr' },
              { icon: MapPin, label: 'Adresse', value: '12 rue de la République, 69001 Lyon' },
              { icon: Clock, label: 'Horaires', value: 'Lun–Ven 8h–18h · Sam 9h–12h' },
            ].map(({ icon: Icon, label, value, href }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <Icon className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
                  {href ? (
                    <a href={href} className="text-lg hover:text-brand-600">{value}</a>
                  ) : (
                    <div className="text-lg">{value}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="space-y-4 rounded-lg border border-neutral-200 bg-white p-8">
            <h2 className="text-xl font-bold">Demander un devis</h2>
            <div>
              <label className="mb-1 block text-sm font-medium">Nom</label>
              <input type="text" className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input type="email" className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Téléphone</label>
              <input type="tel" className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Votre projet</label>
              <textarea rows={4} className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
            </div>
            <button type="submit" className="w-full rounded-md bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
              Envoyer
            </button>
          </form>
        </div>
      </section>
    </>
  )
}
