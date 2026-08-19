import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { games, gameSessions, players, rewards } from '../db/schema.js';
import { env } from '../env.js';
import { isValidPhone, normalizePhone } from '../lib/codes.js';
import { signPlayerToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { rateLimit } from '../lib/rateLimit.js';
import { getStreak } from '../lib/streaks.js';
import { stockForDate } from '../lib/inventory.js';
import { todayInTz } from '../lib/time.js';
import { whatsappUrl } from '../lib/whatsapp.js';

const router: Router = Router();

const LoginBody = z.object({
  phone: z.string().min(1).max(30),
});

// Ojo con los límites por IP: en el local todos los clientes salen por el mismo
// WiFi, así que el límite fuerte va por número y el de IP queda holgado.
const ipLimiter = rateLimit({ windowMs: 5 * 60_000, max: 300 });
const phoneLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 12,
  key: (req) => `phone:${normalizePhone(String((req.body as any)?.phone ?? 'sin-numero'))}`,
});

router.post('/auth/login', ipLimiter, phoneLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', code: 'INVALID_BODY' });
    return;
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidPhone(phone)) {
    res.status(400).json({
      error: 'Número inválido. Escríbelo con indicativo, ej: +573001234567',
      code: 'INVALID_PHONE',
    });
    return;
  }

  const today = todayInTz();

  let [player] = await db.select().from(players).where(eq(players.phone, phone));
  if (!player) {
    [player] = await db.insert(players).values({ phone }).returning();
    logger.info('Nuevo jugador registrado', { playerId: player.id });
  }

  if (player.blocked) {
    res.status(403).json({
      error: 'Este número está bloqueado. Escríbenos por WhatsApp.',
      code: 'PLAYER_BLOCKED',
    });
    return;
  }

  const todayGames = await db
    .select()
    .from(games)
    .where(and(eq(games.playerId, player.id), eq(games.playDate, today)));

  const streak = await getStreak(db, player.id, today);

  if (todayGames.length >= env.GAMES_PER_DAY) {
    const [todayReward] = await db
      .select()
      .from(rewards)
      .where(and(eq(rewards.playerId, player.id), eq(rewards.issuedDate, today)))
      .orderBy(desc(rewards.createdAt))
      .limit(1);

    res.status(200).json({
      alreadyPlayedToday: true,
      message: 'Ya jugaste hoy. Reclama tu premio en WhatsApp o vuelve mañana.',
      streak,
      todayScore: todayGames[0]?.score ?? null,
      todayReward: todayReward
        ? {
            prizeKey: todayReward.prizeKey,
            label: todayReward.label,
            emoji: todayReward.emoji,
            code: todayReward.code,
            status: todayReward.status,
            validUntil: todayReward.validUntil.toISOString(),
            whatsappUrl: whatsappUrl(todayReward.whatsappMessage),
          }
        : null,
    });
    return;
  }

  // Sesión de juego: sin esto no se puede enviar puntaje.
  //
  // `startedAt` se fija con el reloj de ESTE proceso, no con el NOW() de la base
  // de datos. Si la base está en otro servidor (Neon, Supabase) su reloj puede
  // ir unos segundos distinto al de la app, y al comparar tiempos la partida
  // parecería más corta de lo que fue: el anti-trampa la rechazaría sin razón.
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + 15 * 60_000);
  const [session] = await db
    .insert(gameSessions)
    .values({ playerId: player.id, playDate: today, startedAt, expiresAt })
    .returning();

  const token = signPlayerToken({
    playerId: player.id,
    phone: player.phone,
    sessionId: session.id,
    playDate: today,
  });

  const stock = await stockForDate(db, today);

  res.json({
    alreadyPlayedToday: false,
    token,
    player: { id: player.id, phone: player.phone },
    streak,
    gameDurationSeconds: env.GAME_DURATION_SECONDS,
    prizesToday: stock
      .filter((s) => s.active && !s.unlimited)
      .map((s) => ({ label: s.label, emoji: s.emoji, remaining: s.remaining })),
  });
});

export default router;
