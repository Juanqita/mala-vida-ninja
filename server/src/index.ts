import { createApp } from './app.js';
import { db, pool } from './db/index.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { runMigrations } from './db/migrate.js';
import { seedPrizes } from './db/seed.js';

async function main() {
  // Migraciones + semilla en cada arranque: el servicio queda listo solo,
  // que es lo que necesitan Render y Railway en un deploy nuevo.
  await runMigrations();
  await seedPrizes(db, { onlyIfEmpty: true });

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('Servidor arriba', { port: env.PORT, env: env.NODE_ENV, tz: env.TIMEZONE });
  });

  const shutdown = (signal: string) => {
    logger.info('Cerrando servidor', { signal });
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('No se pudo iniciar el servidor', { message: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
