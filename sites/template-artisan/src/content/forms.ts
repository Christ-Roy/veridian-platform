/**
 * Formulaires éditables via le CMS.
 * Créés dans la collection `forms` de Payload (plugin form-builder).
 *
 * Chaque form a un slug stable qu'on réutilise pour le référencer depuis
 * les blocs `formBlock` dans les pages.
 */
export const FORMS = [
  {
    slug: 'contact',
    title: 'Formulaire de contact',
    fields: [
      {
        blockType: 'text',
        name: 'name',
        label: 'Nom',
        required: true,
        width: 50,
      },
      {
        blockType: 'email',
        name: 'email',
        label: 'Email',
        required: true,
        width: 50,
      },
      {
        blockType: 'text',
        name: 'phone',
        label: 'Téléphone',
        required: false,
        width: 100,
      },
      {
        blockType: 'select',
        name: 'subject',
        label: 'Type de projet',
        required: true,
        width: 100,
        options: [
          { label: 'Maçonnerie', value: 'maconnerie' },
          { label: 'Rénovation', value: 'renovation' },
          { label: 'Extension', value: 'extension' },
          { label: 'Autre', value: 'autre' },
        ],
      },
      {
        blockType: 'textarea',
        name: 'message',
        label: 'Votre projet',
        required: true,
        width: 100,
      },
    ],
    submitButtonLabel: 'Envoyer la demande',
    confirmationType: 'message',
    confirmationMessage: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { text: 'Merci ! Nous vous répondrons sous 24h ouvrées.' },
            ],
          },
        ],
      },
    },
    emails: [
      {
        emailTo: 'contact@dupont-btp.fr',
        emailFrom: 'notifications@veridian.site',
        subject: 'Nouvelle demande de devis',
        message: {
          root: {
            children: [
              {
                type: 'paragraph',
                children: [
                  { text: 'Nouvelle demande reçue via le site :' },
                ],
              },
            ],
          },
        },
      },
    ],
  },
]
