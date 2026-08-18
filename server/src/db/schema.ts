import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/**
 * players — un jugador por número de WhatsApp.
 */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull().unique(),
    name: text('name'),
    blocked: boolean('blocked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    phoneIdx: index('idx_players_phone').on(t.phone),
  }),
);

/**
 * game_sessions — una sesión se crea al presionar JUGAR y se consume al enviar
 * el puntaje. Sirve de anti-cheat: sin sesión válida no hay partida.
 */
export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    playDate: date('play_date', { mode: 'string' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => ({
    playerIdx: index('idx_sessions_player').on(t.playerId),
    dateIdx: index('idx_sessions_date').on(t.playDate),
  }),
);

/**
 * games — una partida terminada y registrada.
 */
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => gameSessions.id),
    score: integer('score').notNull(),
    comboMax: integer('combo_max').notNull().default(0),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    itemsCut: integer('items_cut').notNull().default(0),
    bombsHit: integer('bombs_hit').notNull().default(0),
    endedByBomb: boolean('ended_by_bomb').notNull().default(false),
    playDate: date('play_date', { mode: 'string' }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    playerIdx: index('idx_games_player').on(t.playerId),
    dateIdx: index('idx_games_play_date').on(t.playDate),
    playerDateIdx: uniqueIndex('uq_games_player_date').on(t.playerId, t.playDate),
    scoreIdx: index('idx_games_score').on(t.score),
  }),
);

/**
 * prizes — catálogo editable de premios. `dailyStock = null` significa ilimitado
 * (el premio de consolación). `priority` 1 es el mejor premio.
 */
export const prizes = pgTable('prizes', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  emoji: text('emoji').notNull().default('🎁'),
  priority: integer('priority').notNull(),
  minScore: integer('min_score').notNull().default(0),
  dailyStock: integer('daily_stock'),
  active: boolean('active').notNull().default(true),
  whatsappTemplate: text('whatsapp_template').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * prize_stock_days — contador atómico de stock por día y por premio.
 * El UPDATE condicional sobre `issued < stock_limit` es lo que evita entregar
 * dos hamburguesas el mismo día aunque dos jugadores terminen a la vez.
 */
export const prizeStockDays = pgTable(
  'prize_stock_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stockDate: date('stock_date', { mode: 'string' }).notNull(),
    prizeKey: text('prize_key')
      .notNull()
      .references(() => prizes.key, { onDelete: 'cascade' }),
    stockLimit: integer('stock_limit').notNull(),
    issued: integer('issued').notNull().default(0),
  },
  (t) => ({
    uq: uniqueIndex('uq_stock_date_prize').on(t.stockDate, t.prizeKey),
  }),
);

/**
 * rewards — el premio concreto que se le entregó a un jugador.
 */
export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id').references(() => games.id, { onDelete: 'cascade' }),
    prizeKey: text('prize_key').notNull(),
    label: text('label').notNull(),
    emoji: text('emoji').notNull().default('🎁'),
    code: text('code').notNull().unique(),
    source: text('source').notNull().default('game'), // game | streak | manual
    score: integer('score'),
    whatsappMessage: text('whatsapp_message').notNull(),
    status: text('status').notNull().default('pending'), // pending | claimed | expired | void
    issuedDate: date('issued_date', { mode: 'string' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: text('claimed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    playerIdx: index('idx_rewards_player').on(t.playerId),
    codeIdx: index('idx_rewards_code').on(t.code),
    statusIdx: index('idx_rewards_status').on(t.status),
    dateIdx: index('idx_rewards_issued_date').on(t.issuedDate),
  }),
);

/**
 * streaks — racha de días consecutivos por jugador.
 */
export const streaks = pgTable('streaks', {
  playerId: uuid('player_id')
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  lastPlayedDate: date('last_played_date', { mode: 'string' }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * settings — configuración editable desde el panel admin (clave/valor).
 */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * admin_audit — traza de todo lo que hace un admin (canjes, cambios de stock).
 */
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    detail: jsonb('detail'),
    actor: text('actor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('idx_audit_created').on(t.createdAt),
  }),
);

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Prize = typeof prizes.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type Streak = typeof streaks.$inferSelect;
