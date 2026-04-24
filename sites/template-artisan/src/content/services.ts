/**
 * Page Services — éditable par le client dans le CMS.
 */
import type { Block } from '@/lib/cms'

export const SERVICES: Block[] = [
  {
    blockType: 'hero',
    eyebrow: 'Nos prestations',
    title: 'Nos services de maçonnerie',
    subtitle:
      'De la petite réparation au chantier complet, nous intervenons avec le même sérieux sur tout le département du Rhône.',
  },
  {
    blockType: 'services',
    title: 'Ce que nous faisons',
    subtitle: '6 domaines d\'expertise, 35 ans d\'expérience.',
    items: [
      { icon: 'hammer', title: 'Maçonnerie générale', description: 'Murs, dalles, fondations, reprises en sous-œuvre. Tous types d\'ouvrages neufs et rénovation.' },
      { icon: 'home', title: 'Rénovation complète', description: 'Mise aux normes, isolation thermique, aménagement intérieur. Projet clé en main.' },
      { icon: 'home', title: 'Extension', description: 'Agrandissement de maison, véranda, garage. Permis de construire géré par nos soins.' },
      { icon: 'wrench', title: 'Enduits & façades', description: 'Ravalement, enduits extérieurs, isolation thermique par l\'extérieur (ITE).' },
      { icon: 'wrench', title: 'Petites réparations', description: 'Dépannage urgent, fissures, infiltrations. Interventions rapides 48h.' },
      { icon: 'leaf', title: 'Aménagement extérieur', description: 'Terrasses, allées, murets, piscines. Embellissez vos espaces.' },
    ],
  },
  {
    blockType: 'richtext',
    title: 'Une expertise reconnue',
    alignment: 'center',
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                text: "Depuis 1987, Dupont BTP accompagne les particuliers et professionnels du Rhône dans tous leurs projets. Notre équipe de 8 artisans qualifiés est formée aux dernières techniques et certifiée RGE pour vous faire bénéficier des aides de l'État (MaPrimeRénov', CEE).",
              },
            ],
          },
        ],
      },
    },
  },
  {
    blockType: 'cta',
    title: 'Parlons de votre projet',
    description: 'Déplacement gratuit pour estimation, devis détaillé sous 48h.',
    ctaLabel: 'Demander un devis',
    ctaUrl: '/contact',
  },
]
