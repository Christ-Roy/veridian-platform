/**
 * Contenu de la page Accueil.
 *
 * Pattern content-first :
 *   1. Tu codes/édites ici en TypeScript avec le vrai contenu du client
 *   2. Le site build affiche ça directement (fallback si CMS indispo)
 *   3. Lors de la livraison : `pnpm tsx cms/scripts/seed-from-code.ts template-artisan`
 *      → crée le tenant + la page CMS avec EXACTEMENT ces blocs
 *   4. Le client édite dans le CMS, le code reste de référence
 */
import type { Block } from '@/lib/cms'

export const HOME: Block[] = [
  {
    blockType: 'hero',
    eyebrow: 'Artisan certifié RGE',
    title: 'Dupont BTP, votre artisan maçon local',
    subtitle:
      "Maçonnerie, rénovation, extension — 35 ans d'expérience au service des particuliers et des pros.",
    ctas: [
      { label: 'Demander un devis', url: '/contact', variant: 'primary' },
      { label: 'Voir nos services', url: '/services', variant: 'secondary' },
    ],
  },
  {
    blockType: 'services',
    title: "Nos domaines d'intervention",
    subtitle: 'De la petite réparation au gros œuvre.',
    items: [
      { icon: 'hammer', title: 'Maçonnerie', description: 'Murs, dalles, fondations, reprises en sous-œuvre.' },
      { icon: 'home', title: 'Rénovation', description: 'Mise aux normes, isolation, aménagement intérieur.' },
      { icon: 'home', title: 'Extension', description: 'Agrandissement maison, véranda, garage.' },
    ],
  },
  {
    blockType: 'testimonials',
    title: 'Ce que disent nos clients',
    items: [
      {
        quote: "Travail impeccable sur notre extension. Équipe à l'écoute, chantier propre, délais tenus.",
        author: 'Marie L.',
        role: 'Particulière · Lyon 2ᵉ',
      },
      {
        quote: 'Devis clair, prix juste, chantier nickel. Je recommande sans hésiter.',
        author: 'Jean-Claude P.',
        role: 'Particulier · Villeurbanne',
      },
      {
        quote: "Intervention rapide pour une reprise de fondations urgente. Vraiment pros.",
        author: 'Sophie M.',
        role: 'Gérante SCI · Lyon 6ᵉ',
      },
    ],
  },
  {
    blockType: 'cta',
    title: 'Un projet ? Parlons-en.',
    description: 'Déplacement gratuit, devis détaillé sous 48h.',
    ctaLabel: 'Contactez-nous',
    ctaUrl: '/contact',
  },
]
