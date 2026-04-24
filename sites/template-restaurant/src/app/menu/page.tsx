export const dynamic = 'force-static'

const entrees = [
  { name: 'Velouté de potimarron', desc: 'Crème fouettée aux noisettes torréfiées', price: '12€' },
  { name: 'Œuf parfait', desc: 'Asperges vertes, écume de parmesan', price: '14€' },
  { name: 'Tartare de bœuf', desc: 'Couteau, cornichons, moutarde ancienne', price: '16€' },
]

const plats = [
  { name: 'Suprême de volaille fermière', desc: 'Écrasé de pommes de terre, jus corsé', price: '26€' },
  { name: 'Dos de cabillaud', desc: 'Risotto crémeux aux agrumes', price: '28€' },
  { name: 'Ris de veau', desc: 'Morilles, vin jaune du Jura', price: '34€' },
]

const desserts = [
  { name: 'Tarte fine aux pommes', desc: 'Glace vanille de Madagascar', price: '10€' },
  { name: 'Mousse au chocolat', desc: 'Grué de cacao, sel de Guérande', price: '9€' },
  { name: 'Baba au rhum', desc: 'Crème fouettée, rhum à discrétion', price: '12€' },
]

function Section({ title, items }: { title: string; items: { name: string; desc: string; price: string }[] }) {
  return (
    <div className="mb-16">
      <h2 className="mb-8 font-serif text-3xl font-bold tracking-tight">
        <span className="border-b-2 border-brand-600 pb-2">{title}</span>
      </h2>
      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.name} className="flex items-baseline justify-between gap-6 border-b border-dashed border-neutral-300 pb-4">
            <div>
              <h3 className="font-serif text-xl font-semibold">{item.name}</h3>
              <p className="mt-1 text-sm italic text-neutral-600">{item.desc}</p>
            </div>
            <div className="text-lg font-semibold text-brand-700">{item.price}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Menu() {
  return (
    <>
      <section className="border-b border-neutral-200 bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="font-serif text-5xl font-bold">Notre carte</h1>
          <p className="mt-4 text-lg italic text-neutral-600">
            Renouvelée chaque mois au gré des saisons.
          </p>
          <div className="mt-8 inline-block rounded-lg border border-brand-200 bg-brand-50 px-6 py-4">
            <div className="text-sm font-semibold uppercase tracking-wider text-brand-700">Menu dégustation</div>
            <div className="mt-1 font-serif text-2xl font-bold">5 services — 65€</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <Section title="Entrées" items={entrees} />
        <Section title="Plats" items={plats} />
        <Section title="Desserts" items={desserts} />
      </section>
    </>
  )
}
