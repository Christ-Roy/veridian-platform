import type { Block } from '@/lib/cms'

export const HOME: Block[] = [
  {
    blockType: 'hero',
    eyebrow: 'Cuisine française · Lyon 2ᵉ',
    title: "Le Bistro d'Alice",
    subtitle: 'Une cuisine de saison, généreuse et précise, dans un cadre intime rue Mercière.',
    ctas: [
      { label: 'Réserver une table', url: '/contact', variant: 'primary' },
      { label: 'Découvrir la carte', url: '/menu', variant: 'secondary' },
    ],
  },
  {
    blockType: 'services',
    title: 'Notre engagement',
    items: [
      { icon: 'leaf', title: 'Produits de saison', description: 'Carte renouvelée tous les mois.' },
      { icon: 'star', title: 'Maître Restaurateur', description: 'Titre officiel depuis 2018.' },
      { icon: 'hammer', title: 'Fait maison', description: 'Du pain au dessert, tout est fait ici.' },
      { icon: 'clock', title: 'Service soigné', description: 'Ouvert midi et soir du mardi au samedi.' },
    ],
  },
  {
    blockType: 'richtext',
    title: 'Une cuisine de caractère',
    alignment: 'center',
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                text: "Depuis 2015, Alice propose une cuisine française revisitée, fondée sur les produits du marché et les circuits courts. Chaque plat raconte une saison, un producteur, une rencontre. Bienvenue chez nous.",
              },
            ],
          },
        ],
      },
    },
  },
  {
    blockType: 'cta',
    title: 'Envie de passer à table ?',
    description: 'Nous vous recommandons de réserver — le bistro se remplit vite.',
    ctaLabel: 'Réserver maintenant',
    ctaUrl: '/contact',
  },
]
