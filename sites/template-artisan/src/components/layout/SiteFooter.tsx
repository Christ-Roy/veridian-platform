import { Hammer, Phone, Mail, MapPin, Clock, Facebook, Instagram, Linkedin } from 'lucide-react'
import type { FooterDoc } from '@/lib/cms'

interface Props {
  footer: FooterDoc | null
  fallbackName: string
}

export function SiteFooter({ footer, fallbackName }: Props) {
  const company = footer?.company ?? {}
  const name = company.name ?? fallbackName
  const social = footer?.social ?? {}
  const year = new Date().getFullYear()

  return (
    <footer className="mt-24 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-bold">
            <Hammer className="h-5 w-5 text-brand-600" />
            {name}
          </div>
          {company.tagline && (
            <p className="mt-2 text-sm text-neutral-600">{company.tagline}</p>
          )}
          {(social.facebook || social.instagram || social.linkedin) && (
            <div className="mt-4 flex gap-3">
              {social.facebook && (
                <a href={social.facebook} className="text-neutral-500 hover:text-brand-600" aria-label="Facebook">
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {social.instagram && (
                <a href={social.instagram} className="text-neutral-500 hover:text-brand-600" aria-label="Instagram">
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {social.linkedin && (
                <a href={social.linkedin} className="text-neutral-500 hover:text-brand-600" aria-label="LinkedIn">
                  <Linkedin className="h-5 w-5" />
                </a>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Contact</div>
          {company.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-brand-600" /> {company.phone}
            </div>
          )}
          {company.email && (
            <div className="mt-1 flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-brand-600" /> {company.email}
            </div>
          )}
          {company.address && (
            <div className="mt-1 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" />
              <span className="whitespace-pre-line">{company.address}</span>
            </div>
          )}
        </div>

        {footer?.hours?.length ? (
          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              <Clock className="inline h-4 w-4 text-brand-600" /> Horaires
            </div>
            <ul className="space-y-1 text-sm">
              {footer.hours.map((h, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span className="text-neutral-700">{h.day}</span>
                  <span className="text-neutral-500">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-neutral-500">
          <div>
            © {year} {name}
            {footer?.legal?.siret && ` · SIRET ${footer.legal.siret}`}
          </div>
          <div className="flex gap-4">
            {footer?.legal?.mentionsUrl && (
              <a href={footer.legal.mentionsUrl} className="hover:text-brand-600">Mentions légales</a>
            )}
            <span>Propulsé par <a href="https://veridian.site" className="hover:text-brand-600">Veridian</a></span>
          </div>
        </div>
      </div>
    </footer>
  )
}
