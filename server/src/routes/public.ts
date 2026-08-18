import { Router } from 'express';
import { count, desc, eq, max } from 'drizzle-orm';
import { db } from '../db/index.js';
import { games, players } from '../db/schema.js';
import { maskPhone } from '../lib/codes.js';
import { stockForDate } from '../lib/inventory.js';
import { todayInTz } from '../lib/time.js';

const router: Router = Router();

/** Stock público del día: sirve para el gancho "queda 1 hamburguesa hoy". */
router.get('/prizes/today', async (_req, res): Promise<void> => {
  const today = todayInTz();
  const stock = await stockForDate(db, today);
  res.json({
    date: today,
    prizes: stock
      .filter((s) => s.active)
      .map((s) => ({
        label: s.label,
        emoji: s.emoji,
        minScore: s.minScore,
        remaining: s.remaining,
        unlimited: s.unlimited,
      })),
  });
});

/** Top 10. `scope=today` para el ranking del día. */
router.get('/leaderboard', async (req, res): Promise<void> => {
  const scope = req.query.scope === 'today' ? 'today' : 'all';
  const today = todayInTz();

  const rows = await db
    .select({
      playerId: games.playerId,
      phone: players.phone,
      bestScore: max(games.score),
      plays: count(games.id),
    })
    .from(games)
    .leftJoin(players, eq(games.playerId, players.id))
    .where(scope === 'today' ? eq(games.playDate, today) : undefined)
    .groupBy(games.playerId, players.phone)
    .orderBy(desc(max(games.score)))
    .limit(10);

  res.json({
    scope,
    date: today,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      phoneMasked: maskPhone(r.phone ?? ''),
      bestScore: Number(r.bestScore ?? 0),
      plays: Number(r.plays ?? 0),
    })),
  });
});

export default router;
