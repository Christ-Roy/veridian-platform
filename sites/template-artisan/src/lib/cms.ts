const API_URL = process.env.CMS_API_URL || 'https://cms.staging.veridian.site'
const TENANT_SLUG = process.env.CMS_TENANT_SLUG || 'artisan'
const API_KEY = process.env.CMS_API_KEY

type Media = { url?: string; alt?: string } | null

export interface PageDoc {
  id: number
  title: string
  slug: string
  heroTitle?: string | null
  heroSubtitle?: string | null
  heroImage?: Media
  sections?: Array<{ heading?: string | null; body?: unknown; image?: Media }>
}

interface TenantDoc { id: number; slug: string; name: string }

async function api<T>(path: string): Promise<T | null> {
  try {
    const url = `${API_URL}/api${path}`
    const headers: Record<string, string> = {}
    if (API_KEY) headers.Authorization = `users API-Key ${API_KEY}`
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) {
      console.warn(`[cms] ${res.status} ${url}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn('[cms] fetch failed, using fallback', err)
    return null
  }
}

let _tenantId: number | null | undefined
async function getTenantId(): Promise<number | null> {
  if (_tenantId !== undefined) return _tenantId
  const data = await api<{ docs: TenantDoc[] }>(
    `/tenants?where[slug][equals]=${encodeURIComponent(TENANT_SLUG)}&limit=1`,
  )
  _tenantId = data?.docs[0]?.id ?? null
  return _tenantId
}

export async function getPage(slug: string): Promise<PageDoc | null> {
  const tenantId = await getTenantId()
  if (!tenantId) return null
  const data = await api<{ docs: PageDoc[] }>(
    `/pages?where[tenant][equals]=${tenantId}&where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=2`,
  )
  return data?.docs[0] ?? null
}

export function mediaUrl(media: Media, fallback: string): string {
  if (media?.url) return new URL(media.url, API_URL).toString()
  return fallback
}
