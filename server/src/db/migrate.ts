import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findMigrationsFolder(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../drizzle'),
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(process.cwd(), 'server/drizzle'),
    path.resolve(__dirname, '../drizzle'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function runMigrations(): Promise<void> {
  const folder = findMigrationsFolder();
  if (!folder) {
    logger.warn('No se encontró la carpeta de migraciones; se omite');
    return;
  }
  await migrate(db, { migrationsFolder: folder });
  logger.info('Migraciones aplicadas', { folder });
}

// Permite `npm run db:migrate`
if (process.argv[1] && process.argv[1].includes('migrate')) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error('Fallo al migrar', { message: (err as Error).message });
      await pool.end();
      process.exit(1);
    });
}
