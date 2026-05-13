# Dette technique — Veridian platform

> Liste centralisée des dettes techniques à fixer, identifiées en cours de session.
> Chaque entrée doit avoir : **symptôme**, **diagnostic actuel**, **moyen de reproduire/tester**, **fix proposé**.
>
> Mis à jour au fil de l'eau. Quand une dette est fixée → la déplacer dans `archive/` ou la supprimer.

## Index

| ID | Titre | Sévérité | État |
|---|---|---|---|
| [DETTE-001](./001-crowdsec-bouncer-saturation.md) | CrowdSec bouncer saturation + ghost bouncers | 🟢 résolue | closed 2026-05-08 (bump v1.7.7 + allowlist LAPI) |
| [DETTE-002](./002-reseau-traefik-mal-configure.md) | Réseau Traefik / dokploy-network mal configuré (172.17.0.1 leak) | 🟠 haute | open |
| [DETTE-003](./003-ci-flaky-tests-apps.md) | CI flaky tests sur apps (hub, prospection, analytics, cms, notifuse) | 🟠 haute | open |

## Sévérité
- 🔴 **critique** : impacte la prod, peut faire down un service
- 🟠 **haute** : bloque le développement ou des chantiers en cours
- 🟡 **moyenne** : ralentit ou rend fragile, pas urgent
- 🟢 **basse** : nice-to-have
