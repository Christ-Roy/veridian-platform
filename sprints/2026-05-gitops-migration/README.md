# Sprint GitOps Veridian — 2026-05

> Sprint déclenché après audit Trivy 2026-05-13 qui a révélé 50+ CVE CRITICAL en prod
> qu'on ne peut pas patcher en CI bloquant tant que Dokploy reste source de vérité.
>
> Référence externe : `~/Bureau/SPRINT-GITOPS-VERIDIAN.md` (briefing initial Robert)
> Issue parent : `todo/infra/TODO.md` P0.8

## Vision du sprint

Passer de "compose collé dans Dokploy UI (provider Raw)" à **GitOps natif**
(provider Git Dokploy) + **CI security par app** + **auto-merge des patches**
Trivy-clean.

**Objectif mesurable** : 0 CRIT/HIGH en prod à la fin du sprint, déploiements
auto-merge sur patches, audit trail Git complet.

## Phases

| Phase | Description | Agent | Statut |
|---|---|---|---|
| **0a** | Audit état prod (containers, composes, volumes, zombies) | infra | ✅ fait — voir [prod-inventory-audit.md](prod-inventory-audit.md) |
| **0b** | Cleanup zombies (containers exited, composes orphelins, volumes inutiles) | infra | 📋 plan rédigé — voir [cleanup-plan.md](cleanup-plan.md) — attente go Robert |
| **0c** | Pilot Notifuse en GitOps + rédaction `gitops-pattern.md` | infra | en attente Phase 0b |
| **1** | Migration apps en parallèle | agents applicatifs | en attente Phase 0c |
| **2** | CI security par app + Dependabot + Renovate auto-merge | agents applicatifs | en attente Phase 1 |
| **3** | Validation finale, métriques sprint | infra | en attente Phase 2 |

## Documents du sprint

### Documents partagés (tous les agents lisent)

- [README.md](README.md) — ce fichier, point d'entrée
- [prod-inventory-audit.md](prod-inventory-audit.md) — inventaire prod actuel (Phase 0a)
- [cleanup-plan.md](cleanup-plan.md) — plan de cleanup zombies avec décisions "kill/keep"
- [gitops-pattern.md](gitops-pattern.md) — runbook canonique migration Raw → Git (rédigé en Phase 0c)

### Documents par agent

Chaque agent ouvre SON fichier dans `agents/` qui contient :
- Le scope précis (compose-id Dokploy, image, volumes, endpoints)
- Les pièges spécifiques à cette app (références mémoires)
- La checklist phase A (migration GitOps) et phase B (CI security)
- L'état d'avancement (rempli par l'agent au fur et à mesure)

### Agent infra (1 — Claude)

Scope : tout ce qui n'est pas une app SaaS Veridian.
Inclut : Traefik, CrowdSec, fail2ban, monitoring, backups, Dokploy core, Supabase (decision kill),
obs CLI, Trivy compose, runbook GitOps, cleanup prod, CI security templates partagés.

| Agent | Fichier | Worktree | Statut |
|---|---|---|---|
| 🥇 Infra | [agents/00-infra.md](agents/00-infra.md) | `veridian-platform-infra` | en cours (pilot Notifuse + cleanup + runbook) |

### Agents applicatifs (1 par app SaaS Veridian)

Scope par agent : SA seule app — compose `infra/services/<app>/`, code Next.js/etc, workflow CI security, Dependabot.
**Pas de droit sur l'infra commune.**

| Agent | Fichier | Worktree | Priorité |
|---|---|---|---|
| Notifuse | [agents/notifuse.md](agents/notifuse.md) | `veridian-platform-notifuse` | 🥇 piloté par l'agent infra (1er à migrer) |
| Hub | [agents/hub.md](agents/hub.md) | `veridian-platform-hub` | 2 — après pilot Notifuse validé |
| Prospection | [agents/prospection.md](agents/prospection.md) | `veridian-platform-prospection` | 2 — parallèle Hub |
| Analytics | [agents/analytics.md](agents/analytics.md) | `veridian-platform-analytics` | 2 — parallèle Hub |
| CMS | [agents/cms.md](agents/cms.md) | `veridian-platform-cms` | 2 — parallèle Hub |
| Twenty | [agents/twenty.md](agents/twenty.md) | `veridian-platform-twenty` | 3 |
| Asset-bank | [agents/asset-bank.md](agents/asset-bank.md) | `veridian-platform-sites` | 4 |
| LinkedIn dashboard | [agents/linkedin-dashboard.md](agents/linkedin-dashboard.md) | `veridian-platform-sites` | 4 |
| Verger-shop | [agents/verger-shop.md](agents/verger-shop.md) | `veridian-platform-sites` | 4 |

## Règles partagées (tous les agents)

1. **NE JAMAIS** modifier la stack Dokploy en mode Raw une fois en Git → tout passe par PR
2. **NE JAMAIS** delete les volumes Docker existants pendant la migration
3. **TOUJOURS** snapshot AVANT toute action irréversible — créer `tmp/dokploy-snapshot-<date>/`
   dans le worktree (gitignoré localement, archivable en branche `forensics/`)
4. **TOUJOURS** tester sur dev (si dev existe pour l'app) avant prod
5. **Si certs Let's Encrypt cassent** → restore Raw immédiatement, investigate
6. **Si CrowdSec bouncer crashe** → restore Raw, lire `project_infra_pieges.md`
7. **Pas de bricolage** : tout passe par UI Dokploy (provider switch) + PR Git
   pour le compose. Pas de `docker run` direct, pas de modif `/etc/dokploy/compose/`
   à la main.

## Métriques de succès du sprint

À tracker dans `sprints/2026-05-gitops-migration/status.md` (hebdomadaire) :

| Métrique | Aujourd'hui | Objectif |
|---|---|---|
| Stacks Dokploy en mode Git | 0/N | N/N |
| Apps avec workflow `security-cve.yml` | 0/N | N/N |
| CVE CRITICAL en prod | 50+ (audit 2026-05-13) | 0 |
| CVE HIGH en prod | 600+ | < 20 (non-fixable) |
| Images SHA-pinned | 0/28 | 28/28 |
| Apps avec Dependabot actif | 0/N | N/N |
| PR Dependabot mergées dans la semaine | n/a | mesurer dès activation |
| Temps moyen patch CVE upstream → prod | manuel (heures-jours) | < 24h auto |

## Commandes utiles

```bash
# Voir l'état d'un sprint
ls sprints/2026-05-gitops-migration/

# Voir où chaque agent en est
grep -l "Status:" sprints/2026-05-gitops-migration/agents/*.md | \
  xargs grep "^Status:" | head

# Audit prod en cours pour comparer avec la baseline
obs check security

# Rapport CVE images live
ssh prod-pub 'cd /home/ubuntu/veridian/grafana/trivy && \
  sudo docker compose run --rm --quiet-pull trivy image <image:tag> 2>/dev/null' | \
  jq '[.Results[].Vulnerabilities[]?.Severity] | group_by(.) | map({sev: .[0], n: length})'
```

## Historique du sprint

- **2026-05-13** : Audit Trivy révèle 50+ CRIT. Bump Traefik prod+dev fait via
  script idempotent (`grafana/scripts/bump-traefik.sh`). Sprint initié,
  inventaire prod complet, plan cleanup rédigé.
