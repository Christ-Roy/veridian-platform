/**
 * Rate limiter en memoire, reutilisable par endpoint.
 *
 * Chaque instance gere sa propre fenetre de temps et son max.
 * Les entrees expirees sont nettoyees automatiquement pour eviter
 * une fuite memoire sur les serveurs long-running.
 *
 * Utilisation :
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 100 });
 *   if (!limiter.check(key)) return NextResponse.json(..., { status: 429 });
 *
 * Note : en memoire = pas partage entre workers/instances. Acceptable pour
 * un VPS mono-instance. Pour du multi-instance, passer a Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Fenetre de temps en ms (defaut: 60 000 = 1 min) */
  windowMs?: number;
  /** Nombre max de requetes par fenetre (defaut: 60) */
  max?: number;
  /** Intervalle de nettoyage des entrees expirees en ms (defaut: 5 min) */
  cleanupIntervalMs?: number;
}

export interface RateLimiter {
  /** Retourne true si la requete est autorisee, false si rate limited. */
  check(key: string): boolean;
  /** Reset une cle (utile pour les tests). */
  reset(key: string): void;
  /** Nombre d'entrees actives (utile pour les tests / monitoring). */
  size(): number;
}

export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;
  const cleanupIntervalMs = opts.cleanupIntervalMs ?? 5 * 60_000;

  const map = new Map<string, RateLimitEntry>();

  // Nettoyage periodique pour eviter la fuite memoire.
  // Le setInterval est unref() pour ne pas bloquer le shutdown Node.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (entry.resetAt < now) map.delete(key);
    }
  }, cleanupIntervalMs);
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();

  return {
    check(key: string): boolean {
      const now = Date.now();
      const entry = map.get(key);
      if (!entry || entry.resetAt < now) {
        map.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count++;
      return true;
    },
    reset(key: string) {
      map.delete(key);
    },
    size() {
      return map.size;
    },
  };
}
