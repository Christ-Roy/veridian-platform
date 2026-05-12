import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Tests d'intégration Payload — environnement **`node`** par défaut.
 *
 * Pourquoi pas jsdom : tous les specs qui touchent `payload.create` / `update`
 * / `delete` passent par `file-type` v21 (validation upload, mimetype, etc.).
 * Cette lib check `instanceof Uint8Array` sur le Buffer, ce qui foire dans le
 * realm jsdom (le Buffer Node n'est pas un Uint8Array du realm jsdom). Ça
 * rend l'API locale `payload.create` inutilisable côté tests, alors même
 * qu'elle fonctionne en prod.
 *
 * Solution : tests int en `environment: 'node'` (le default ici). Pour un
 * spec UI futur qui aurait besoin de jsdom (composant React isolé), ajouter
 * `// @vitest-environment jsdom` au top du fichier — override par-fichier.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Payload schema push runs on getPayload() — deux pushs séparés sur le
    // même Postgres collisionnent (relation "users_roles" already exists
    // observé en CI 2026-05-12). Pour partager une seule instance Payload
    // entre tous les fichiers .int.spec.ts :
    //  - `pool: 'forks'` : utilise des processus enfants (besoin pour pg + payload natif)
    //  - `singleFork: true` : un seul fork pour tous les specs (séquentiel)
    //  - `isolate: false` : ne reset PAS le module graph entre les specs,
    //    donc `getPayload({ config })` retourne le même singleton et
    //    pushDevSchema ne s'exécute qu'au premier appel.
    pool: 'forks',
    isolate: false,
    forks: {
      singleFork: true,
    },
    // Force séquentiel entre les fichiers .int.spec.ts. Sans ça, Vitest
    // peut lancer 3 fichiers en parallèle dans le même fork, et chacun
    // appelle `getPayload({ config })` qui trigger pushDevSchema en
    // parallèle → 3 `CREATE TYPE enum_users_roles` concurrents →
    // "type already exists" (code 42710). singleFork limite à 1 fork
    // (séquentiel entre forks) mais pas entre files dans le même fork.
    fileParallelism: false,
  },
})
