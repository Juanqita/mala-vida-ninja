import { Router } from 'express';
import { and, avg, count, desc, eq, max } from 'drizzle-orm';
import { db } from '../db/index.js';
import { games, players, rewards } from '../db/schema.js';
import { verifyPlayerToken } from '../lib/jwt.js';
import { getStreak } from '../lib/streaks.js';
import { todayInTz } from '../lib/time.js';
import { whatsappUrl } from '../lib/whatsapp.js';

const router: Router = Router();

router.get('/player/me', async (req, res): Promise<void> => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Token requerido', code: 'NO_TOKEN' });
    return;
  }

  let playerId: string;
  try {
    playerId = verifyPlayerToken(token).playerId;
  } catch {
    res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN' });
    return;
  }

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) {
    res.status(404).json({ error: 'Jugador no encontrado' });
    return;
  }

  const [stats] = await db
    .select({
      totalGames: count(games.id),
      bestScore: max(games.score),
      avgScore: avg(games.score),
    })
    .from(games)
    .where(eq(games.playerId, playerId));

  const myRewards = await db
    .select()
    .from(rewards)
    .where(eq(rewards.playerId, playerId))
    .orderBy(desc(rewards.createdAt))
    .limit(20);

  const today = todayInTz();
  const streak = await getStreak(db, playerId, today);
  const [todayGame] = await db
    .select()
    .from(games)
    .where(and(eq(games.playerId, playerId), eq(games.playDate, today)));

  res.json({
    player: { id: player.id, phone: player.phone, createdAt: player.createdAt.toISOString() },
    totalGames: Number(stats?.totalGames ?? 0),
    bestScore: Number(stats?.bestScore ?? 0),
    avgScore: Math.round(Number(stats?.avgScore ?? 0)),
    streak,
    playedToday: Boolean(todayGame),
    todayScore: todayGame?.score ?? null,
    rewards: myRewards.map((r) => ({
      label: r.label,
      emoji: r.emoji,
      code: r.code,
      status: r.status,
      source: r.source,
      issuedDate: r.issuedDate,
      validUntil: r.validUntil.toISOString(),
      whatsappUrl: whatsappUrl(r.whatsappMessage),
    })),
  });
});

export default router;
