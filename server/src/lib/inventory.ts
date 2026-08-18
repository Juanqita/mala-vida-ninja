import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { prizes, prizeStockDays } from '../db/schema.js';
import type { Prize } from '../db/schema.js';

export interface PrizeAward {
  prize: Prize;
  /** true si el jugador merecía un premio mejor pero ya se había agotado hoy. */
  downgraded: boolean;
  /** premio al que aspiraba por puntaje, si hubo downgrade. */
  deservedKey: string | null;
}

/**
 * Asigna un premio para un puntaje dado, respetando el stock del día.
 *
 * Cascada: se busca el mejor premio cuyo `minScore` alcance el puntaje; si ese
 * ya se agotó hoy, se baja al siguiente, y así hasta el premio de consolación
 * (stock ilimitado), que nunca falla.
 *
 * La reserva es un UPDATE condicional `issued < stock_limit`, atómico en
 * Postgres: si dos jugadores terminan en el mismo milisegundo, solo uno se
 * lleva la última hamburguesa. No hace falta lock explícito ni transacción
 * serializable.
 */
export async function awardPrize(
  db: Db,
  opts: { score: number; date: string },
): Promise<PrizeAward> {
  const catalog = await db
    .select()
    .from(prizes)
    .where(eq(prizes.active, true))
    .orderBy(asc(prizes.priority));

  if (catalog.length === 0) {
    throw new Error('No hay premios configurados. Corre `npm run db:seed`.');
  }

  const startIdx = catalog.findIndex((p) => opts.score >= p.minScore);
  const deserved = startIdx >= 0 ? catalog[startIdx] : catalog[catalog.length - 1];
  const chain = startIdx >= 0 ? catalog.slice(startIdx) : [catalog[catalog.length - 1]];

  for (const prize of chain) {
    // Stock ilimitado (consolación): se entrega siempre.
    if (prize.dailyStock === null) {
      return {
        prize,
        downgraded: prize.key !== deserved.key,
        deservedKey: prize.key !== deserved.key ? deserved.key : null,
      };
    }

    if (prize.dailyStock <= 0) continue;

    // Asegura la fila del día. Si ya existe, no la toca (el admin pudo editar el
    // límite de hoy y no queremos pisarlo).
    await db
      .insert(prizeStockDays)
      .values({
        stockDate: opts.date,
        prizeKey: prize.key,
        stockLimit: prize.dailyStock,
        issued: 0,
      })
      .onConflictDoNothing();

    const reserved = await db
      .update(prizeStockDays)
      .set({ issued: sql`${prizeStockDays.issued} + 1` })
      .where(
        and(
          eq(prizeStockDays.stockDate, opts.date),
          eq(prizeStockDays.prizeKey, prize.key),
          sql`${prizeStockDays.issued} < ${prizeStockDays.stockLimit}`,
        ),
      )
      .returning({ id: prizeStockDays.id });

    if (reserved.length > 0) {
      return {
        prize,
        downgraded: prize.key !== deserved.key,
        deservedKey: prize.key !== deserved.key ? deserved.key : null,
      };
    }
    // Agotado → sigue con el siguiente premio de la cascada.
  }

  // Red de seguridad: si nadie tenía stock, entrega el último del catálogo.
  const fallback = catalog[catalog.length - 1];
  return {
    prize: fallback,
    downgraded: fallback.key !== deserved.key,
    deservedKey: fallback.key !== deserved.key ? deserved.key : null,
  };
}

/** Devuelve el stock restante de cada premio para una fecha. */
export async function stockForDate(db: Db, date: string) {
  const catalog = await db.select().from(prizes).orderBy(asc(prizes.priority));
  const rows = await db
    .select()
    .from(prizeStockDays)
    .where(eq(prizeStockDays.stockDate, date));

  return catalog.map((p) => {
    const row = rows.find((r) => r.prizeKey === p.key);
    const limit = row?.stockLimit ?? p.dailyStock;
    const issued = row?.issued ?? 0;
    return {
      key: p.key,
      label: p.label,
      emoji: p.emoji,
      priority: p.priority,
      minScore: p.minScore,
      active: p.active,
      unlimited: limit === null,
      limit,
      issued,
      remaining: limit === null ? null : Math.max(0, limit - issued),
    };
  });
}

/** Ajusta el límite de hoy sin tocar el catálogo permanente. */
export async function setStockForDate(
  db: Db,
  date: string,
  prizeKey: string,
  newLimit: number,
) {
  const [prize] = await db.select().from(prizes).where(eq(prizes.key, prizeKey));
  if (!prize) throw new Error(`Premio desconocido: ${prizeKey}`);

  await db
    .insert(prizeStockDays)
    .values({ stockDate: date, prizeKey, stockLimit: newLimit, issued: 0 })
    .onConflictDoUpdate({
      target: [prizeStockDays.stockDate, prizeStockDays.prizeKey],
      set: { stockLimit: newLimit },
    });
}
