/**
 * Page Contact — éditable par le client dans le CMS.
 */
import type { Block } from '@/lib/cms'

export const CONTACT: Block[] = [
  {
    blockType: 'hero',
    eyebrow: 'Nous contacter',
    title: 'Parlons de votre projet',
    subtitle: 'Un devis, une question, une urgence ? Nous vous répondons sous 24h.',
  },
  {
    blockType: 'services',
    title: 'Plusieurs façons de nous joindre',
    items: [
      { icon: 'clock', title: 'Téléphone', description: '04 00 00 00 00 — Lun–Ven 8h–18h, Samedi 9h–12h' },
      { icon: 'leaf', title: 'Email', description: 'contact@dupont-btp.fr — Réponse sous 24h ouvrées' },
      { icon: 'home', title: 'Agence', description: '12 rue de la République, 69001 Lyon. Sur rendez-vous.' },
    ],
  },
  {
    blockType: 'richtext',
    title: 'Zones d\'intervention',
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                text: "Nous intervenons sur tout le département du Rhône : Lyon, Villeurbanne, Caluire, Vaulx-en-Velin, Bron, Vénissieux, Saint-Priest, Meyzieu, Décines, Rillieux, et plus largement la Métropole de Lyon. Pour les chantiers plus éloignés, nous étudions chaque demande.",
              },
            ],
          },
        ],
      },
    },
  },
  {
    blockType: 'cta',
    title: 'Urgence ? Appelez-nous directement',
    description: 'Pour les interventions urgentes (fissure, fuite, effondrement), nous avons une astreinte 7j/7.',
    ctaLabel: 'Appeler 04 00 00 00 00',
    ctaUrl: 'tel:+33400000000',
  },
]
