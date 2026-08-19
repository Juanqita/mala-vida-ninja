import { Router } from 'express';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { games, gameSessions, players, prizes, rewards } from '../db/schema.js';
import { env } from '../env.js';
import { generateRewardCode } from '../lib/codes.js';
import { awardPrize } from '../lib/inventory.js';
import { verifyPlayerToken, type PlayerToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { renderTemplate, STREAK_REWARDS } from '../lib/prizes.js';
import { bumpStreak } from '../lib/streaks.js';
import { todayInTz } from '../lib/time.js';
import { whatsappUrl } from '../lib/whatsapp.js';

const router: Router = Router();

const MAX_SCORE = 15_000;
const POINTS_PER_ITEM = 50;
const MAX_MULTIPLIER = 3;

const SubmitBody = z.object({
  token: z.string().min(10),
  score: z.number().int().min(0),
  comboMax: z.number().int().min(0).max(500).optional().default(0),
  durationSeconds: z.number().int().min(0).max(600),
  itemsCut: z.number().int().min(0).max(2000).optional().default(0),
  bombsHit: z.number().int().min(0).max(100).optional().default(0),
  endedByBomb: z.boolean().optional().default(false),
});

function reject(res: any, code: string, error: string, meta?: Record<string, unknown>) {
  logger.warn('Anti-cheat rechazó una partida', { code, ...meta });
  res.status(400).json({ error, code });
}

router.post('/game/submit', async (req, res): Promise<void> => {
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', code: 'INVALID_BODY' });
    return;
  }

  const body = parsed.data;

  let token: PlayerToken;
  try {
    token = verifyPlayerToken(body.token);
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada', code: 'INVALID_TOKEN' });
    return;
  }

  const today = todayInTz();
  const { playerId, sessionId } = token;

  // ── 1. La sesión debe existir, ser de hoy y no haberse usado ───────────────
  const [session] = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.playerId, playerId)));

  if (!session) {
    reject(res, 'NO_SESSION', 'No encontramos tu partida. Vuelve a entrar.', { playerId });
    return;
  }
  if (session.consumedAt) {
    reject(res, 'SESSION_USED', 'Esta partida ya fue registrada.', { playerId });
    return;
  }
  if (session.expiresAt.getTime() < Date.now()) {
    reject(res, 'SESSION_EXPIRED', 'Tu partida expiró. Vuelve a entrar.', { playerId });
    return;
  }
  if (session.playDate !== today) {
    reject(res, 'SESSION_OTHER_DAY', 'Tu partida es de otro día. Vuelve a entrar.', { playerId });
    return;
  }

  // ── 2. Coherencia de puntaje, duración y cortes ────────────────────────────
  if (body.score > MAX_SCORE) {
    reject(res, 'SCORE_OUT_OF_BOUNDS', 'Puntaje imposible', { playerId, score: body.score });
    return;
  }

  const maxDuration = env.GAME_DURATION_SECONDS + 5;
  if (body.durationSeconds < 1 || body.durationSeconds > maxDuration) {
    reject(res, 'BAD_DURATION', 'Duración de partida inválida', { playerId });
    return;
  }

  // El reloj del servidor manda: no se puede reportar más tiempo del que
  // realmente pasó desde que se abrió la sesión. La tolerancia es generosa a
  // propósito (relojes que no coinciden, latencia de red, animación de fin de
  // partida): un tramposo de verdad se cae igual, porque tendría que esperar
  // los 45 segundos completos para poder enviar un puntaje.
  const CLOCK_TOLERANCE_SECONDS = Math.min(15, Math.max(8, env.GAME_DURATION_SECONDS / 2));
  const serverElapsed = (Date.now() - session.startedAt.getTime()) / 1000;
  if (serverElapsed + CLOCK_TOLERANCE_SECONDS < body.durationSeconds) {
    reject(res, 'TIME_TRAVEL', 'Duración inconsistente con el servidor', {
      playerId,
      serverElapsed,
      reported: body.durationSeconds,
    });
    return;
  }

  // Una partida que llegó al final tiene que haber durado lo que dura el juego.
  // Solo puede terminar antes si el jugador cortó una bomba.
  if (!body.endedByBomb && body.durationSeconds < env.GAME_DURATION_SECONDS - 3) {
    reject(res, 'SHORT_GAME', 'La partida terminó antes de tiempo', {
      playerId,
      reported: body.durationSeconds,
    });
    return;
  }

  const maxPossible = body.itemsCut * POINTS_PER_ITEM * MAX_MULTIPLIER;
  if (body.score > maxPossible) {
    reject(res, 'SCORE_ITEMS_MISMATCH', 'El puntaje no coincide con los cortes', {
      playerId,
      score: body.score,
      itemsCut: body.itemsCut,
    });
    return;
  }

  // ── 3. Una partida por jugador por día ─────────────────────────────────────
  const existing = await db
    .select()
    .from(games)
    .where(and(eq(games.playerId, playerId), eq(games.playDate, today)));

  if (existing.length >= env.GAMES_PER_DAY) {
    res.status(409).json({ error: 'Ya registraste tu partida de hoy', code: 'ALREADY_PLAYED_TODAY' });
    return;
  }

  // ── 4. Consume la sesión (idempotencia frente a doble clic) ────────────────
  const consumed = await db
    .update(gameSessions)
    .set({ consumedAt: new Date() })
    .where(and(eq(gameSessions.id, sessionId), isNull(gameSessions.consumedAt)))
    .returning({ id: gameSessions.id });

  if (consumed.length === 0) {
    // Otra petición ganó la carrera.
    res.status(409).json({ error: 'Esta partida ya fue registrada.', code: 'SESSION_USED' });
    return;
  }

  // ── 5. Guarda la partida ───────────────────────────────────────────────────
  let game;
  try {
    [game] = await db
      .insert(games)
      .values({
        playerId,
        sessionId,
        score: body.score,
        comboMax: body.comboMax,
        durationSeconds: body.durationSeconds,
        itemsCut: body.itemsCut,
        bombsHit: body.bombsHit,
        endedByBomb: body.endedByBomb,
        playDate: today,
      })
      .returning();
  } catch (err) {
    // El índice único (player_id, play_date) es la última línea de defensa.
    res.status(409).json({ error: 'Ya registraste tu partida de hoy', code: 'ALREADY_PLAYED_TODAY' });
    return;
  }

  const [player] = await db.select().from(players).where(eq(players.id, playerId));

  // ── 6. Premio con stock del día ────────────────────────────────────────────
  const award = await awardPrize(db, { score: body.score, date: today });
  const code = generateRewardCode();
  const message = renderTemplate(award.prize.whatsappTemplate, {
    score: body.score,
    code,
    label: award.prize.label,
    phone: player?.phone,
  });
  const validUntil = new Date(Date.now() + env.REWARD_VALID_HOURS * 3600_000);

  const [reward] = await db
    .insert(rewards)
    .values({
      playerId,
      gameId: game.id,
      prizeKey: award.prize.key,
      label: award.prize.label,
      emoji: award.prize.emoji,
      code,
      source: 'game',
      score: body.score,
      whatsappMessage: message,
      issuedDate: today,
      validUntil,
    })
    .returning();

  // ── 7. Racha y su premio extra ─────────────────────────────────────────────
  const streak = await bumpStreak(db, playerId, today);
  let streakReward: typeof reward | null = null;

  const streakDef = STREAK_REWARDS.find((s) => s.day === streak.currentStreak);
  if (streakDef) {
    let label = streakDef.label;

    // Día 5: el premio depende del promedio de los 5 días de la racha.
    if (streakDef.day === 5) {
      const last = await db
        .select({ score: games.score })
        .from(games)
        .where(eq(games.playerId, playerId))
        .orderBy(desc(games.playDate))
        .limit(5);
      const avg = Math.round(last.reduce((a, g) => a + g.score, 0) / Math.max(1, last.length));
      const catalog = await db
        .select()
        .from(prizes)
        .where(eq(prizes.active, true))
        .orderBy(asc(prizes.priority));
      const tier = catalog.find((p) => avg >= p.minScore) ?? catalog[catalog.length - 1];
      label = `Racha 5 días: ${tier.label} (promedio ${avg.toLocaleString('es-CO')} pts)`;
    }

    const streakCode = generateRewardCode('MVR');
    [streakReward] = await db
      .insert(rewards)
      .values({
        playerId,
        gameId: game.id,
        prizeKey: `streak_day_${streakDef.day}`,
        label,
        emoji: streakDef.emoji,
        code: streakCode,
        source: 'streak',
        score: body.score,
        whatsappMessage: `🔥 ¡Hola! Llevo ${streak.currentStreak} días seguidos jugando en Mala Vida Fast Food y gané *${label}*. Mi código es *${streakCode}*.`,
        issuedDate: today,
        validUntil,
      })
      .returning();
  }

  logger.info('Partida registrada', {
    playerId,
    score: body.score,
    prize: award.prize.key,
    downgraded: award.downgraded,
    streak: streak.currentStreak,
  });

  res.status(201).json({
    finalScore: body.score,
    reward: {
      prizeKey: reward.prizeKey,
      label: reward.label,
      emoji: reward.emoji,
      code: reward.code,
      validUntil: reward.validUntil.toISOString(),
      whatsappUrl: whatsappUrl(reward.whatsappMessage),
      downgraded: award.downgraded,
      deservedKey: award.deservedKey,
    },
    streakReward: streakReward
      ? {
          label: streakReward.label,
          emoji: streakReward.emoji,
          code: streakReward.code,
          whatsappUrl: whatsappUrl(streakReward.whatsappMessage),
        }
      : null,
    streak,
  });
});

export default router;
