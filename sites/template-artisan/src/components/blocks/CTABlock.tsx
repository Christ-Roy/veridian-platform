import Link from 'next/link'

interface CTAProps {
  title: string
  description?: string | null
  ctaLabel: string
  ctaUrl: string
}

export function CTABlock({ title, description, ctaLabel, ctaUrl }: CTAProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 text-center">
      <h2 className="text-3xl font-bold">{title}</h2>
      {description && <p className="mt-3 text-neutral-600">{description}</p>}
      <Link
        href={ctaUrl}
        className="mt-8 inline-flex items-center gap-2 rounded-md bg-brand-600 px-8 py-4 text-lg font-semibold text-white hover:bg-brand-700"
      >
        {ctaLabel}
      </Link>
    </section>
  )
}
