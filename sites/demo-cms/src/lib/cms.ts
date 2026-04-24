const API_URL = process.env.CMS_API_URL || 'https://cms.staging.veridian.site'
const TENANT_SLUG = process.env.CMS_TENANT_SLUG || 'demo'
const API_KEY = process.env.CMS_API_KEY

type Media = { url?: string; alt?: string } | null

export interface PageDoc {
  id: number
  title: string
  slug: string
  heroTitle?: string | null
  heroSubtitle?: string | null
  heroImage?: Media
  sections?: Array<{
    heading?: string | null
    body?: unknown
    image?: Media
  }>
}

interface TenantDoc {
  id: number
  slug: string
  name: string
}

async function api<T>(path: string): Promise<T> {
  const url = `${API_URL}/api${path}`
  const headers: Record<string, string> = {}
  if (API_KEY) headers.Authorization = `users API-Key ${API_KEY}`
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error(`CMS ${res.status} ${url}`)
  return res.json() as Promise<T>
}

async function getTenantId(): Promise<number> {
  const data = await api<{ docs: TenantDoc[] }>(
    `/tenants?where[slug][equals]=${encodeURIComponent(TENANT_SLUG)}&limit=1`,
  )
  const tenant = data.docs[0]
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" introuvable dans le CMS`)
  return tenant.id
}

export async function getPage(slug: string): Promise<PageDoc | null> {
  const tenantId = await getTenantId()
  const data = await api<{ docs: PageDoc[] }>(
    `/pages?where[tenant][equals]=${tenantId}&where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=2`,
  )
  return data.docs[0] ?? null
}
