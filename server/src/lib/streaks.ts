import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { streaks } from '../db/schema.js';
import { STREAK_REWARDS } from './prizes.js';
import { yesterdayOf } from './time.js';

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
  nextStreakDay: number;
  nextRewardLabel: string;
  todayRewardLabel: string | null;
}

function rewardForDay(day: number): string {
  const found = STREAK_REWARDS.find((r) => r.day === day);
  return found?.label ?? 'Premio especial por racha';
}

export function buildStreakInfo(
  currentStreak: number,
  bestStreak: number,
  lastPlayedDate: string | null,
  todayRewardLabel: string | null = null,
): StreakInfo {
  const nextDay = currentStreak >= 5 ? 5 : currentStreak + 1;
  return {
    currentStreak,
    bestStreak,
    lastPlayedDate,
    nextStreakDay: nextDay,
    nextRewardLabel: rewardForDay(nextDay),
    todayRewardLabel,
  };
}

/** Lectura sin efectos: si el jugador se saltó un día, la racha ya vale 0. */
export async function getStreak(db: Db, playerId: string, today: string): Promise<StreakInfo> {
  const [row] = await db.select().from(streaks).where(eq(streaks.playerId, playerId));
  if (!row) return buildStreakInfo(0, 0, null);

  const stillAlive =
    row.lastPlayedDate === today || row.lastPlayedDate === yesterdayOf(today);

  return buildStreakInfo(
    stillAlive ? row.currentStreak : 0,
    row.bestStreak,
    row.lastPlayedDate,
  );
}

/** Se llama al registrar una partida. Devuelve la racha ya actualizada. */
export async function bumpStreak(
  db: Db,
  playerId: string,
  today: string,
): Promise<StreakInfo> {
  const [row] = await db.select().from(streaks).where(eq(streaks.playerId, playerId));

  if (!row) {
    const [created] = await db
      .insert(streaks)
      .values({ playerId, currentStreak: 1, bestStreak: 1, lastPlayedDate: today })
      .returning();
    return buildStreakInfo(created.currentStreak, created.bestStreak, created.lastPlayedDate, rewardForDay(1));
  }

  let next: number;
  if (row.lastPlayedDate === today) next = row.currentStreak;
  else if (row.lastPlayedDate === yesterdayOf(today)) next = row.currentStreak + 1;
  else next = 1;

  const [updated] = await db
    .update(streaks)
    .set({
      currentStreak: next,
      bestStreak: Math.max(next, row.bestStreak),
      lastPlayedDate: today,
    })
    .where(eq(streaks.playerId, playerId))
    .returning();

  return buildStreakInfo(
    updated.currentStreak,
    updated.bestStreak,
    updated.lastPlayedDate,
    rewardForDay(Math.min(updated.currentStreak, 5)),
  );
}
