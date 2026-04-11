# Vision cross-app — problèmes stratégiques qui dépassent une seule app

> Ce fichier capture les questions architecturales qui traversent plusieurs
> apps du monorepo Veridian et qui ne peuvent pas être traitées dans le TODO
> d'une seule app. On les écrit ici en langage naturel pour y réfléchir sans
> se mettre la pression de les coder tout de suite.
>
> Règle : Claude peut ajouter des entrées ici quand il identifie un sujet
> cross-app. Robert review en session stratégique et décide quand/comment
> attaquer.
>
> Dernière mise à jour : 2026-04-11

## 🎯 Problème #1 — Tenant cross-app sans re-consommer la période d'essai Stripe

### Le problème concret

Veridian est un monorepo SaaS avec plusieurs apps (hub, prospection, twenty,
notifuse, analytics, et d'autres à venir). Chaque app a :
- Son propre auth (c'est une décision architecturale figée, cf CLAUDE.md racine)
- Sa propre intégration Stripe (si elle a un modèle payant)
- Sa propre DB de tenants
- Son propre cycle de trial/billing

Quand un client arrive via le hub et s'inscrit à **Analytics**, il rentre dans
sa période d'essai (exemple : 14 jours gratuits). Un mois plus tard, il
découvre **Prospection** et veut l'essayer. Aujourd'hui il devrait :

1. Créer un nouveau compte sur Prospection (séparé de celui d'Analytics)
2. Rentrer dans une nouvelle période d'essai Prospection de 14 jours
3. Gérer deux abonnements séparés côté Stripe

C'est frictionnel, c'est laid, et ça nuit à la conversion. Mais à l'inverse :

- **On ne peut pas donner un seul trial global pour tous les saas** :
  si un client teste Analytics, puis un mois plus tard veut Prospection,
  son trial sera déjà "consommé" et il devra payer directement. Ça le
  freine à essayer la deuxième app.
- **On ne peut pas non plus refiler un nouveau trial à chaque app
  sans garde-fou** : un utilisateur malin peut s'inscrire à chaque app
  à tour de rôle pour avoir 14 jours × N apps = trial gratuit très long.

### Ce qu'on veut idéalement

- **Un "compte Veridian" unique** identifié par email, qui permet d'activer
  chaque app avec SON propre trial de 14 jours — mais **chaque app n'a
  son trial qu'une seule fois** (pas re-démarrable en renommant l'email ou
  en forkant un tenant)
- Les apps restent **techniquement indépendantes** (pas de SSO lourd, pas
  d'auth centralisée, pas de DB partagée) pour que chacune puisse fonctionner
  même si les autres sont down
- Le suivi "a-t-il déjà eu son trial sur cette app" est **porté côté hub**
  (ou côté Stripe Customer metadata, ou les deux) pour qu'il soit résilient
  et pas dupliqué dans chaque app

### Pistes à explorer

#### Piste A — Stripe Customer partagé + metadata par app

Le hub crée **un seul Customer Stripe** par email. Chaque app utilise ce
même Customer pour ses subscriptions (Analytics subscription, Prospection
subscription, etc.). Au niveau Customer, on stocke en `metadata` :

```json
{
  "veridian_trial_used_analytics": "2026-04-11T...",
  "veridian_trial_used_prospection": "",
  "veridian_trial_used_twenty": ""
}
```

Quand un client active une app pour la première fois, le hub vérifie la
metadata. Si le champ `veridian_trial_used_<app>` est vide → il démarre un
trial de 14 jours + met à jour la metadata. Si rempli → il démarre
directement la subscription payante (pas de nouveau trial).

**Avantages** : Stripe gère déjà Customer unique par email, metadata gratuite.
**Inconvénients** : chaque app doit talk au hub (dépendance), ou directement
à l'API Stripe (OK mais couplage moyen).

#### Piste B — Hub = source de vérité, apps en "mode lite"

Le hub garde une table `tenant_subscriptions` :
```
email            | app         | trial_used_at | subscribed_at | status
client@x.com     | analytics   | 2026-04-11    | null          | trialing
client@x.com     | prospection | null          | null          | never_activated
```

Quand un client veut activer Prospection, le hub appelle l'admin API de
Prospection pour créer le tenant + annoncer "14 jours trial". Si le hub
voit que le trial a déjà été utilisé, il pousse direct en payant.

**Avantages** : source de vérité centralisée, visibilité Robert facile.
**Inconvénients** : rend le hub obligatoire au moment de l'activation
(mais les apps restent autonomes une fois activées).

#### Piste C — Grace period universelle, pas de trial par app

On abandonne l'idée du "14 jours par app" et on donne un **crédit Veridian
global** : 30 jours d'essai sur TOUTES les apps à l'inscription initiale.
Après 30 jours, c'est payant. Pas de cas limite "trial déjà utilisé".

**Avantages** : ultra simple, zéro état à tracker.
**Inconvénients** : un client qui découvre une deuxième app 6 mois après
n'a plus de trial dessus — ça peut bloquer la discovery.

#### Piste D — "Migration gratuite" depuis une autre app Veridian

Si le client a DÉJÀ une subscription payante sur une app Veridian, il peut
activer gratuitement pendant 14 jours n'importe quelle autre app. On récompense
la loyauté au lieu de donner un trial universel.

**Avantages** : incite à la 2e/3e app, pas de trial gratuit cumulable
à outrance.
**Inconvénients** : complexifie la logique de trial.

### Prochaines étapes

1. **Pas urgent** — aucun client Veridian actuel n'a les 2 apps, donc pas
   de pression immédiate.
2. **À trancher avant le lancement commercial** de la 2e app payante.
3. **Éléments à clarifier** :
   - Robert veut-il un trial cumulable (14j + 14j) ou un trial global (30j) ?
   - Est-ce qu'on veut que les clients sentent un "compte Veridian" unifié
     ou des produits séparés qui partagent juste le billing ?
   - Est-ce qu'on fait du cross-sell actif (bandeau "essaye Prospection
     gratuitement pendant 14j" dans Analytics) ?

---

## 🎯 Problème #2 — Onboarding magic link depuis Analytics (cas d'usage spécifique)

### Le problème

Robert crée un tenant Analytics pour un client (via le skill). Pour l'instant
il doit :
- Créer un user avec `ownerEmail=client@xxx.fr` (OK, automatisé via le skill)
- Ensuite envoyer au client un email avec son lien de login + demander de
  définir un mot de passe

La friction est forte : le client reçoit un mail "connectez-vous", clique,
tombe sur un formulaire email/password, se dit "mais je n'ai jamais créé
de compte", et laisse tomber. Robert perd le lead.

### Ce qu'on veut

Un système de **magic link** : Robert clique sur un bouton dans son admin
Analytics (ou déclenche via le skill Claude), ça génère un lien signé
à usage unique (expire en 7 jours), l'envoie automatiquement au client.
Le client clique, arrive directement loggé sur son dashboard, voit ses data,
peut juste optionnellement définir un password plus tard.

### Pistes à explorer

- **Auth.js v5** supporte déjà le email provider (magic link natif) — il suffit
  d'activer le provider + config SMTP (Lark + Brevo déjà dispo). Le flow
  standard Auth.js gère la génération du token, le stockage en DB
  (`VerificationToken`), l'expiration, le click → session.
- **Envoi de l'email** : Brevo API (credentials dispo) ou Notifuse (self-hosted)
- **UX côté Robert** : un bouton "Envoyer magic link" sur le dashboard
  admin Analytics ou le skill `analytics-provision` qui pourrait aussi
  avoir une commande "send-magic-link".

### Flow magic link "style Prospection" (spec Robert, 2026-04-11)

Robert veut reproduire exactement le flow déjà en place sur l'app
Prospection, qui fonctionne bien :

1. **Robert clique "Envoyer magic link"** depuis son workspace admin
   (voir problème #3 ci-dessous) pour un client donné
2. Le client reçoit un email avec un lien signé à usage unique
3. **Click sur le lien → page d'onboarding** avec :
   - L'email **pré-rempli** dans le champ (le client ne tape rien, le
     token contient déjà l'email)
   - Un champ "choisir un mot de passe" (pour les prochaines connexions)
   - Optionnellement "confirmer le mot de passe"
   - Bouton "Valider et entrer"
4. Après validation :
   - Le password est hashé et stocké en DB (`User.passwordHash`)
   - Une session longue durée est créée → **token browser 9 mois**
     (pas de re-login tous les 30 jours, le client reste loggué presque
     un an sans toucher à rien)
   - Redirect direct vers `/dashboard`
5. Les fois suivantes, le client revient sur `analytics.app.veridian.site`
   et est **déjà loggué** (cookie 9 mois)

**Détails techniques importants** :
- Durée session 9 mois = `session.maxAge: 9 * 30 * 24 * 60 * 60` dans
  la config Auth.js (pas la valeur par défaut 30 jours)
- Le magic link lui-même expire court (24h max) — c'est le cookie de
  session qui est long, pas le token magic link
- Le lien porte un `token` et peut-être un `email` (en query string ou
  dans le JWT du token) pour pré-remplir le formulaire
- Si le client perd son cookie, il doit pouvoir se re-loguer avec
  email/password, OU demander un nouveau magic link depuis la page de
  login (lien "Je n'ai plus mon mot de passe")

**Référence** : le code Prospection (app `prospection/`) a déjà un flow
équivalent — Claude doit le lire et l'adapter à Analytics au lieu de
réinventer la roue. Voir `prospection/src/app/(auth)/` et la config
Auth.js de Prospection.

---

## 🎯 Problème #3 — Workspace admin Robert (cross-app)

### Le problème

Quand Robert se loggue sur Analytics avec son compte (`robert@veridian.site`),
il voit **son** tenant `veridian` et ses data. Mais c'est aussi le SUPERADMIN
de la plateforme : il devrait pouvoir :

1. **Voir la liste de tous les tenants configurés** (Tramtech, Morel, Apical,
   et les futurs) avec leur état
2. **Voir la data de chaque tenant** pour contrôler que tout est conforme
   (le tracker est bien branché, les formulaires remontent, GSC sync,
   appels trackés)
3. **Faire des actions sans passer par Claude** :
   - Envoyer un magic link à un client
   - Rotate une site-key
   - Déclencher une sync GSC manuelle
   - Voir les derniers events ingérés
   - Pour l'instant, tout ça doit passer par le skill Claude → friction

### Ce qu'on veut

Un mode "workspace admin" activé quand l'utilisateur loggué a le rôle
`SUPERADMIN` (ou un flag `isVeridianAdmin` sur `User`). Dans ce mode :

- Un switcher de tenant dans le header (dropdown "Vue en tant que : Veridian ▼")
  qui liste tous les tenants + "Tout" pour une vue globale
- Une page `/admin` dédiée qui liste tous les tenants avec pour chacun :
  - Score Veridian + services actifs/inactifs (réutilise l'endpoint `/status`)
  - Nombre de sites
  - Bouton "Envoyer magic link" (déclenche le flow ci-dessus)
  - Bouton "Rotate key"
  - Bouton "Sync GSC maintenant"
  - Bouton "Ouvrir le dashboard client" (impersonation douce : Robert voit
    le dashboard EXACTEMENT comme le client le voit, avec un bandeau
    "Mode admin — vous consultez le tenant X")
- Le switcher + la page `/admin` sont visibles UNIQUEMENT si
  `session.user.role === 'SUPERADMIN'`. Les clients réguliers ne voient rien.

### Ce que ça exige côté modèle

- Ajouter un champ `role` sur `User` (ou utiliser `Membership.role` mais
  distinguer un "role de plateforme" d'un "role de tenant")
- Attribuer `SUPERADMIN` au user `robert@veridian.site` dans le seed
- La logique "quel tenant vois-je ?" doit pouvoir prendre le tenant de
  session (default) OU un override admin (query param `?asTenant=<slug>`)

### Lien avec le problème #1 (tenant cross-app + Stripe trial)

Quand on résoudra le #1, le workspace admin de Robert sera l'UI qui
montrera pour chaque client ses subscriptions cross-app : "Le client X
a Analytics trial jusqu'au 2026-05-01, Prospection non activée". C'est
la console d'admin Veridian unifiée.

### Prochaines étapes

1. **Pas dans le MVP Analytics immédiat** (Phase A), mais **important
   pour la Phase A+**. À attaquer dans une session dédiée après que
   les 3 clients soient provisionnés.
2. **À attaquer en vraie Team Claude Code** (3-4 teammates : un pour le
   schema/auth SUPERADMIN, un pour la page `/admin`, un pour le flow
   magic link Auth.js, un pour les tests).
3. **Dépend de** : magic link (problème #2) activé.

### Stratégie "bring to the SaaS doucement"

Le magic link n'est qu'un bout du puzzle. L'idée plus large :

1. Le client reçoit un mail "Voici les métriques de votre site → [click]"
2. Il arrive sur son dashboard, voit ses chiffres, est impressionné
3. Sur son dashboard il voit aussi des blocs "shadow marketing" qui
   annoncent des services payants qu'il n'a pas encore activés
4. Quand il veut activer un service → il clique → il arrive sur une page
   de devis ou un email pré-rempli vers Robert
5. Robert transforme le lead

C'est là que le **magic link + admin Robert + shadow marketing + UI actions**
se combinent pour faire un funnel passif qui tourne tout seul.

### Prochaines étapes

1. Implémenter le magic link dans Analytics (via Auth.js email provider)
2. Ajouter une action "Envoyer magic link" dans le dashboard admin
   Analytics (une page admin à faire) OU dans le skill `analytics-provision`
3. Donner à Robert un rôle `ADMIN` (ou `SUPERADMIN`) qui voit tous les
   tenants, peut switcher de tenant, et peut déclencher des actions
   (magic link, rotate key, sync GSC à la demande, etc.) directement
   depuis l'UI au lieu de passer par Claude à chaque fois

Ce sujet est **lié au problème #1** : si demain on veut que Robert invite
un client Analytics à essayer Prospection, il faudrait que le magic link
l'amène sur les 2 apps à la fois (ou propose l'activation de la 2e).

---

## Historique des décisions cross-app

_(à remplir au fil de l'eau quand Robert tranche un sujet ici)_
