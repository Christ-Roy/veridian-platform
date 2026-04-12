#!/usr/bin/env node
// Bump un user en SUPERADMIN (platform role) pour acceder a /admin.
//
// Usage :
//   node scripts/seed-superadmin.mjs robert@veridian.site
//   node scripts/seed-superadmin.mjs robert@veridian.site --password=xxx
//
// Crée le user s'il n'existe pas. Si --password est fourni, hash et store
// le password (utile pour setup initial, evite d'avoir a passer par un flow
// de reset). Idempotent : peut etre re-run sans danger.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/seed-superadmin.mjs <email> [--password=xxx]');
  process.exit(1);
}

const pwArg = process.argv.find((a) => a.startsWith('--password='));
const password = pwArg ? pwArg.split('=')[1] : null;

const prisma = new PrismaClient();

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  const data = { platformRole: 'SUPERADMIN' };
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (existing) {
    const updated = await prisma.user.update({ where: { email }, data });
    console.log(`[seed-superadmin] bumped ${email} -> SUPERADMIN (id=${updated.id})`);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        ...data,
      },
    });
    console.log(`[seed-superadmin] created ${email} -> SUPERADMIN (id=${created.id})`);
    if (!password) {
      console.log('[seed-superadmin] No password set — use --password=xxx or magic link to login');
    }
  }
} catch (err) {
  console.error('[seed-superadmin] failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
