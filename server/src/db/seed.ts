import { count } from 'drizzle-orm';
import { db as defaultDb, pool, type Db } from './index.js';
import { prizes } from './schema.js';
import { DEFAULT_PRIZES } from '../lib/prizes.js';
import { logger } from '../lib/logger.js';

/**
 * Carga el catálogo de premios. Con `onlyIfEmpty` no pisa cambios hechos desde
 * el panel admin; sin él, restablece el catálogo a los valores por defecto.
 */
export async function seedPrizes(db: Db = defaultDb, opts: { onlyIfEmpty?: boolean } = {}) {
  if (opts.onlyIfEmpty) {
    const [row] = await db.select({ total: count(prizes.key) }).from(prizes);
    if (Number(row?.total ?? 0) > 0) return;
  }

  for (const prize of DEFAULT_PRIZES) {
    await db
      .insert(prizes)
      .values(prize)
      .onConflictDoUpdate({
        target: prizes.key,
        set: {
          label: prize.label,
          emoji: prize.emoji,
          priority: prize.priority,
          minScore: prize.minScore,
          dailyStock: prize.dailyStock,
          whatsappTemplate: prize.whatsappTemplate,
          active: true,
        },
      });
  }
  logger.info('Catálogo de premios cargado', { total: DEFAULT_PRIZES.length });
}

if (process.argv[1] && process.argv[1].includes('seed')) {
  seedPrizes(defaultDb)
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error('Fallo al sembrar', { message: (err as Error).message });
      await pool.end();
      process.exit(1);
    });
}
