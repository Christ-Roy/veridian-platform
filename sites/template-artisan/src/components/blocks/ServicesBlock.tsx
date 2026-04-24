import { CheckCircle2, Hammer, Home, Wrench, Star, Shield, Leaf, Clock } from 'lucide-react'

const ICON_MAP: Record<string, typeof CheckCircle2> = {
  check: CheckCircle2,
  hammer: Hammer,
  home: Home,
  wrench: Wrench,
  star: Star,
  shield: Shield,
  leaf: Leaf,
  clock: Clock,
}

interface ServicesProps {
  title?: string | null
  subtitle?: string | null
  items: Array<{ icon?: string; title: string; description?: string | null }>
}

export function ServicesBlock({ title, subtitle, items }: ServicesProps) {
  return (
    <section className="bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        {title && <h2 className="text-3xl font-bold">{title}</h2>}
        {subtitle && <p className="mt-2 text-neutral-600">{subtitle}</p>}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map((s, i) => {
            const Icon = ICON_MAP[s.icon ?? 'check'] || CheckCircle2
            return (
              <div key={i} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                <Icon className="h-6 w-6 text-brand-600" />
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                {s.description && <p className="mt-2 text-sm text-neutral-600">{s.description}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
