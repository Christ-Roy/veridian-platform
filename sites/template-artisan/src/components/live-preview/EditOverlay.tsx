'use client'

import { useState, type ReactNode } from 'react'

const CMS_URL = process.env.NEXT_PUBLIC_CMS_API_URL || 'https://cms.staging.veridian.site'

/**
 * Overlay "click-to-edit" autour d'un block en mode preview.
 *
 * Au survol → bouton "Éditer" en haut à droite du block.
 * Clic → deeplink vers l'admin Payload, scrollé sur le bon block.
 *
 * Format URL : /admin/collections/pages/{id}#field-blocks-{index}
 * Payload utilise des ancres `#field-blocks-N` sur les sections de l'edit view.
 */
export function EditOverlay({
  children,
  blockType,
  blockIndex,
  pageId,
}: {
  children: ReactNode
  blockType: string
  blockIndex: number
  pageId?: number
}) {
  const [hovered, setHovered] = useState(false)

  const editUrl = pageId
    ? `${CMS_URL}/admin/collections/pages/${pageId}#field-blocks__${blockIndex}__${blockType}`
    : `${CMS_URL}/admin`

  const label = LABELS[blockType] ?? blockType

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        outline: hovered ? '2px solid #86efac' : '2px solid transparent',
        outlineOffset: -2,
        transition: 'outline-color 0.15s ease',
      }}
    >
      {children}
      {hovered && (
        <a
          href={editUrl}
          target="_top"
          rel="noopener"
          aria-label={`Éditer ${label} dans le CMS`}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 50,
            background: '#1a3d2f',
            color: '#86efac',
            padding: '8px 14px',
            borderRadius: 8,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 16px rgba(26, 61, 47, 0.35)',
            cursor: 'pointer',
          }}
        >
          <PencilIcon />
          Éditer · {label}
        </a>
      )}
    </div>
  )
}

const LABELS: Record<string, string> = {
  hero: 'Bandeau principal',
  services: 'Services',
  gallery: 'Galerie',
  testimonials: 'Témoignages',
  cta: 'Appel à l’action',
  richtext: 'Texte',
  formBlock: 'Formulaire',
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
