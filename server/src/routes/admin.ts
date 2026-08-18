import { Router, type NextFunction, type Request, type Response } from 'express';
import { and, asc, count, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { adminAudit, games, players, prizes, prizeStockDays, rewards, streaks } from '../db/schema.js';
import { env } from '../env.js';
import { normalizePhone } from '../lib/codes.js';
import { setStockForDate, stockForDate } from '../lib/inventory.js';
import { logger } from '../lib/logger.js';
import { rateLimit } from '../lib/rateLimit.js';
import { todayInTz } from '../lib/time.js';
import { whatsappUrl } from '../lib/whatsapp.js';

const router: Router = Router();

const adminLimiter = rateLimit({ windowMs: 60_000, max: 120 });

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = (req.headers['x-admin-key'] as string | undefined) ?? String(req.query.key ?? '');
  if (!env.ADMIN_KEY) {
    res.status(503).json({ error: 'ADMIN_KEY no configurada en el servidor' });
    return;
  }
  if (key !== env.ADMIN_KEY) {
    res.status(403).json({ error: 'Clave incorrecta', code: 'FORBIDDEN' });
    return;
  }
  next();
}

async function audit(action: string, detail: unknown, actor = 'admin') {
  await db.insert(adminAudit).values({ action, detail: detail as any, actor });
}

router.use('/admin', adminLimiter);

/** Verifica la clave (lo usa la pantalla de login del panel). */
router.get('/admin/ping', requireAdmin, (_req, res) => {
  res.json({ ok: true, timezone: env.TIMEZONE, today: todayInTz() });
});

/** Resumen del día: métricas + stock. */
router.get('/admin/summary', requireAdmin, async (req, res): Promise<void> => {
  const date = String(req.query.date ?? todayInTz());

  const [gamesToday] = await db
    .select({ total: count(games.id), best: sql<number>`coalesce(max(${games.score}), 0)`, avg: sql<number>`coalesce(round(avg(${games.score})), 0)` })
    .from(games)
    .where(eq(games.playDate, date));

  const [playersTotal] = await db.select({ total: count(players.id) }).from(players);
  const [newPlayers] = await db
    .select({ total: count(players.id) })
    .from(players)
    .where(gte(players.createdAt, new Date(`${date}T00:00:00.000Z`)));

  const rewardsByPrize = await db
    .select({
      prizeKey: rewards.prizeKey,
      label: rewards.label,
      emoji: rewards.emoji,
      total: count(rewards.id),
      claimed: sql<number>`count(*) filter (where ${rewards.status} = 'claimed')`,
    })
    .from(rewards)
    .where(eq(rewards.issuedDate, date))
    .groupBy(rewards.prizeKey, rewards.label, rewards.emoji)
    .orderBy(desc(count(rewards.id)));

  const [pending] = await db
    .select({ total: count(rewards.id) })
    .from(rewards)
    .where(eq(rewards.status, 'pending'));

  const stock = await stockForDate(db, date);

  res.json({
    date,
    timezone: env.TIMEZONE,
    games: {
      total: Number(gamesToday?.total ?? 0),
      bestScore: Number(gamesToday?.best ?? 0),
      avgScore: Number(gamesToday?.avg ?? 0),
    },
    players: { total: Number(playersTotal?.total ?? 0), new: Number(newPlayers?.total ?? 0) },
    rewardsByPrize: rewardsByPrize.map((r) => ({
      ...r,
      total: Number(r.total),
      claimed: Number(r.claimed),
    })),
    pendingRewards: Number(pending?.total ?? 0),
    stock,
  });
});

/** Busca por número de WhatsApp o por código de premio. */
router.get('/admin/lookup', requireAdmin, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'Falta el número o el código' });
    return;
  }

  const looksLikeCode = /[a-zA-Z]/.test(q);

  let player: typeof players.$inferSelect | undefined;
  if (looksLikeCode) {
    const [reward] = await db.select().from(rewards).where(eq(rewards.code, q.toUpperCase()));
    if (!reward) {
      res.json({ found: false, reason: 'Código no encontrado' });
      return;
    }
    [player] = await db.select().from(players).where(eq(players.id, reward.playerId));
  } else {
    const phone = normalizePhone(q);
    const candidates = [phone, `+${phone.replace(/^\+/, '')}`, `+57${phone.replace(/^\+?57/, '')}`];
    for (const candidate of candidates) {
      [player] = await db.select().from(players).where(eq(players.phone, candidate));
      if (player) break;
    }
    if (!player) {
      res.json({ found: false, reason: 'Ese número no ha jugado todavía' });
      return;
    }
  }

  if (!player) {
    res.json({ found: false, reason: 'Jugador no encontrado' });
    return;
  }

  const playerGames = await db
    .select()
    .from(games)
    .where(eq(games.playerId, player.id))
    .orderBy(desc(games.submittedAt))
    .limit(20);

  const playerRewards = await db
    .select()
    .from(rewards)
    .where(eq(rewards.playerId, player.id))
    .orderBy(desc(rewards.createdAt))
    .limit(30);

  const [streak] = await db.select().from(streaks).where(eq(streaks.playerId, player.id));

  res.json({
    found: true,
    player: {
      id: player.id,
      phone: player.phone,
      blocked: player.blocked,
      createdAt: player.createdAt.toISOString(),
    },
    streak: streak
      ? { current: streak.currentStreak, best: streak.bestStreak, lastPlayedDate: streak.lastPlayedDate }
      : { current: 0, best: 0, lastPlayedDate: null },
    stats: {
      totalGames: playerGames.length,
      bestScore: playerGames.reduce((m, g) => Math.max(m, g.score), 0),
      playedToday: playerGames.some((g) => g.playDate === todayInTz()),
    },
    games: playerGames.map((g) => ({
      score: g.score,
      playDate: g.playDate,
      submittedAt: g.submittedAt.toISOString(),
      itemsCut: g.itemsCut,
      comboMax: g.comboMax,
      endedByBomb: g.endedByBomb,
    })),
    rewards: playerRewards.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      emoji: r.emoji,
      status: r.status,
      source: r.source,
      score: r.score,
      issuedDate: r.issuedDate,
      validUntil: r.validUntil.toISOString(),
      claimedAt: r.claimedAt?.toISOString() ?? null,
      whatsappUrl: whatsappUrl(r.whatsappMessage),
    })),
  });
});

/** Lista de premios filtrable, para la pestaña de entregas. */
router.get('/admin/rewards', requireAdmin, async (req, res): Promise<void> => {
  const status = String(req.query.status ?? '');
  const date = String(req.query.date ?? '');
  const conditions = [];
  if (status && status !== 'all') conditions.push(eq(rewards.status, status));
  if (date) conditions.push(eq(rewards.issuedDate, date));

  const rows = await db
    .select({
      id: rewards.id,
      code: rewards.code,
      label: rewards.label,
      emoji: rewards.emoji,
      status: rewards.status,
      source: rewards.source,
      score: rewards.score,
      issuedDate: rewards.issuedDate,
      validUntil: rewards.validUntil,
      claimedAt: rewards.claimedAt,
      phone: players.phone,
    })
    .from(rewards)
    .leftJoin(players, eq(rewards.playerId, players.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(rewards.createdAt))
    .limit(300);

  res.json({
    total: rows.length,
    rewards: rows.map((r) => ({
      ...r,
      validUntil: r.validUntil.toISOString(),
      claimedAt: r.claimedAt?.toISOString() ?? null,
    })),
  });
});

/** Marca un premio como entregado. */
const ClaimBody = z.object({ code: z.string().min(4), actor: z.string().optional() });
router.post('/admin/claim', requireAdmin, async (req, res): Promise<void> => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Falta el código' });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();

  const [reward] = await db.select().from(rewards).where(eq(rewards.code, code));
  if (!reward) {
    res.status(404).json({ error: 'Código no encontrado', code: 'NOT_FOUND' });
    return;
  }
  if (reward.status === 'claimed') {
    res.status(409).json({
      error: 'Este premio ya fue entregado',
      code: 'ALREADY_CLAIMED',
      claimedAt: reward.claimedAt?.toISOString() ?? null,
    });
    return;
  }
  if (reward.status === 'void') {
    res.status(409).json({ error: 'Este premio fue anulado', code: 'VOID' });
    return;
  }
  if (reward.validUntil.getTime() < Date.now()) {
    await db.update(rewards).set({ status: 'expired' }).where(eq(rewards.id, reward.id));
    res.status(409).json({ error: 'Este premio ya venció', code: 'EXPIRED' });
    return;
  }

  const [updated] = await db
    .update(rewards)
    .set({ status: 'claimed', claimedAt: new Date(), claimedBy: parsed.data.actor ?? 'admin' })
    .where(and(eq(rewards.id, reward.id), eq(rewards.status, 'pending')))
    .returning();

  if (!updated) {
    res.status(409).json({ error: 'Este premio ya fue entregado', code: 'ALREADY_CLAIMED' });
    return;
  }

  await audit('claim', { code, rewardId: reward.id }, parsed.data.actor);
  logger.info('Premio entregado', { code, prize: reward.prizeKey });

  res.json({ ok: true, reward: { code: updated.code, label: updated.label, claimedAt: updated.claimedAt } });
});

/** Anula un premio (fraude, error, etc). */
router.post('/admin/void', requireAdmin, async (req, res): Promise<void> => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!code) {
    res.status(400).json({ error: 'Falta el código' });
    return;
  }
  const [updated] = await db
    .update(rewards)
    .set({ status: 'void' })
    .where(eq(rewards.code, code))
    .returning();
  if (!updated) {
    res.status(404).json({ error: 'Código no encontrado' });
    return;
  }
  await audit('void', { code });
  res.json({ ok: true });
});

/** Catálogo de premios: leer y editar. */
router.get('/admin/prizes', requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(prizes).orderBy(asc(prizes.priority));
  res.json({ prizes: rows });
});

const PrizeBody = z.object({
  key: z.string().min(2),
  label: z.string().min(1).optional(),
  emoji: z.string().min(1).max(8).optional(),
  minScore: z.number().int().min(0).optional(),
  dailyStock: z.number().int().min(0).nullable().optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(1).optional(),
  whatsappTemplate: z.string().min(5).optional(),
});

router.post('/admin/prizes', requireAdmin, async (req, res): Promise<void> => {
  const parsed = PrizeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const { key, ...changes } = parsed.data;
  const [updated] = await db.update(prizes).set(changes).where(eq(prizes.key, key)).returning();
  if (!updated) {
    res.status(404).json({ error: 'Premio no encontrado' });
    return;
  }
  await audit('prize_update', parsed.data);
  res.json({ ok: true, prize: updated });
});

/** Ajusta el stock de un día puntual (sin tocar el catálogo permanente). */
router.post('/admin/stock', requireAdmin, async (req, res): Promise<void> => {
  const body = z
    .object({ date: z.string().optional(), prizeKey: z.string(), limit: z.number().int().min(0) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Datos inválidos' });
    return;
  }
  const date = body.data.date ?? todayInTz();
  await setStockForDate(db, date, body.data.prizeKey, body.data.limit);
  await audit('stock_update', body.data);
  res.json({ ok: true, stock: await stockForDate(db, date) });
});

/** Bloquea o desbloquea un número. */
router.post('/admin/player/block', requireAdmin, async (req, res): Promise<void> => {
  const phone = normalizePhone(String(req.body?.phone ?? ''));
  const blocked = Boolean(req.body?.blocked);
  const [updated] = await db
    .update(players)
    .set({ blocked })
    .where(eq(players.phone, phone))
    .returning();
  if (!updated) {
    res.status(404).json({ error: 'Jugador no encontrado' });
    return;
  }
  await audit('player_block', { phone, blocked });
  res.json({ ok: true, blocked: updated.blocked });
});

/** Permite que un jugador vuelva a jugar hoy (borra su partida del día). */
router.post('/admin/player/reset-today', requireAdmin, async (req, res): Promise<void> => {
  const phone = normalizePhone(String(req.body?.phone ?? ''));
  const today = todayInTz();
  const [player] = await db.select().from(players).where(eq(players.phone, phone));
  if (!player) {
    res.status(404).json({ error: 'Jugador no encontrado' });
    return;
  }
  const removed = await db
    .delete(games)
    .where(and(eq(games.playerId, player.id), eq(games.playDate, today)))
    .returning({ id: games.id });

  await audit('player_reset_today', { phone, removed: removed.length });
  res.json({ ok: true, removed: removed.length });
});

/** Export CSV de premios (para contabilidad del restaurante). */
router.get('/admin/export.csv', requireAdmin, async (req, res): Promise<void> => {
  const date = String(req.query.date ?? '');
  const rows = await db
    .select({
      code: rewards.code,
      label: rewards.label,
      status: rewards.status,
      source: rewards.source,
      score: rewards.score,
      issuedDate: rewards.issuedDate,
      claimedAt: rewards.claimedAt,
      phone: players.phone,
    })
    .from(rewards)
    .leftJoin(players, eq(rewards.playerId, players.id))
    .where(date ? eq(rewards.issuedDate, date) : undefined)
    .orderBy(desc(rewards.createdAt));

  const header = 'codigo,premio,estado,origen,puntaje,fecha,entregado_en,telefono';
  const body = rows
    .map((r) =>
      [
        r.code,
        `"${r.label.replaceAll('"', "'")}"`,
        r.status,
        r.source,
        r.score ?? '',
        r.issuedDate,
        r.claimedAt?.toISOString() ?? '',
        r.phone ?? '',
      ].join(','),
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="premios-${date || 'todos'}.csv"`);
  res.send(`${header}\n${body}`);
});

/** Últimas acciones de admin. */
router.get('/admin/audit', requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(50);
  res.json({ audit: rows });
});

/** Borrado total de partidas y premios. Requiere confirmación explícita. */
router.post('/admin/reset-all', requireAdmin, async (req, res): Promise<void> => {
  if (String(req.body?.confirm) !== 'BORRAR TODO') {
    res.status(400).json({ error: 'Escribe exactamente: BORRAR TODO' });
    return;
  }
  await db.delete(rewards);
  await db.delete(games);
  await db.delete(prizeStockDays);
  await db.delete(streaks);
  await audit('reset_all', {});
  logger.warn('Reset total ejecutado desde el panel admin');
  res.json({ ok: true });
});

export default router;
