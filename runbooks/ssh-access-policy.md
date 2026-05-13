# SSH access policy — Veridian prod

> Dernière revue : 2026-05-13

## Hosts

| Host | IP publique | Port SSH | PasswordAuth | Auth |
|---|---|---|---|---|
| prod-pub (OVH VPS) | 51.210.7.44 | 22 + **2222** | disabled | key-only |
| dev-pub (Dev server) | 37.187.199.185 | 22 | disabled | key-only |

⚠ Port `2222` exposé sur le VPS prod = SSH alt (Dokploy SSH git ?) — couvert
par fail2ban-iac `[sshd-alt]` (cf `infra/fail2ban/jail.local`).

## Clés autorisées sur prod (`~/.ssh/authorized_keys`)

Audit 2026-05-13 — 4 clés actives :

| Slot | Type | Identifiant | Usage |
|---|---|---|---|
| 1 | ssh-rsa | `lab` | Clé Robert local KDE (mail) — `~/.ssh/id_rsa.pub` |
| 2 | ssh-ed25519 | `dokploy@veridian` | Dokploy interne (auto-deploy stacks) |
| 3 | ssh-ed25519 | `github-actions-deploy` | CI GitHub Actions — auto-deploy |
| 4 | ssh-ed25519 | `github-actions-verger-deploy` (forced command `curl ...`) | CI verger-shop, scope = curl seul |

## Historique connexions

`last -n 20` au 2026-05-13 — connexions interactives via :
- **Robert local** : `78.112.59.120` (Free FR fibre)
- **Robert 4G mobile** (occasionnel) : `80.214.215.165` (Bouygues Telecom FR)

Aucune autre IP humaine, juste les CI/Dokploy automatiques.

## Procédure d'ajout d'une clé

1. Robert valide explicitement.
2. Ajout via : `ssh prod-pub "echo 'ssh-ed25519 AAAA... user@host' >> ~/.ssh/authorized_keys"`
3. Mettre à jour ce runbook avec la nouvelle entrée.
4. Tester depuis la machine cible (clé peut être typo).

## Procédure de retrait

1. `sed -i '/identifier/d' ~/.ssh/authorized_keys` (ou éditer manuellement).
2. Updater ce runbook.
3. Si la clé était suspecte → rotater toutes les autres aussi par précaution.

## Audit récurrent

À refaire **mensuellement** (cron Dokploy si possible) :

```bash
ssh prod-pub "cat ~/.ssh/authorized_keys | grep -v '^#' | wc -l"  # nombre de clés
ssh prod-pub "last -n 50"                                          # connexions récentes
ssh prod-pub "sudo grep 'Accepted' /var/log/auth.log | tail -20"   # auths réussies
```

Si nombre de clés > 4 ou nouvelle IP humaine inconnue → investiguer.

## Liens

- Tickets connexes : `todo/infra/TODO.md` P1.4 (cet audit), P0.5 (fail2ban HTTP)
- Pentest : 2026-05-12 a confirmé que SSH brute = fail2ban réagit (730 IPs bannies/semaine).
