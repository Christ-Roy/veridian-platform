// Singleton Prisma Client pour Analytics.
// Meme pattern que le Hub : proxy lazy pour eviter d'ouvrir une connexion
// Postgres au build Next.js.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  // En build time (Next.js SSG / CI sans DB), DATABASE_URL peut etre absent.
  // On instancie sans options — les appels reels echoueront a l'execution,
  // pas au demarrage. En prod, DATABASE_URL est toujours injecte par Dokploy.
  if (!connectionString) {
    return new PrismaClient({
      log: ['error'],
    });
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop, receiver);
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = undefined;
}
