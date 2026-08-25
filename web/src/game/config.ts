/**
 * Todo lo que define el balance del juego vive aquí: si quieres que sea más
 * fácil, más difícil o que sume distinto, este es el único archivo que tocas.
 */
export interface ItemConfig {
  type: string;
  emoji: string;
  color: number;
  glow: number;
  points: number;
  positive: boolean;
  endsGame?: boolean;
  /** Peso relativo dentro de su grupo: más peso = aparece más seguido. */
  weight: number;
  /** Multiplicador de tamaño. La bomba es más grande a propósito. */
  scale?: number;
}

export const ITEMS: ItemConfig[] = [
  // Productos del restaurante (suman). Fondo claro para que el ícono resalte.
  { type: 'hamburguesa', emoji: '🍔', color: 0xff8c42, glow: 0xffc999, points: 50, positive: true, weight: 1 },
  { type: 'papas', emoji: '🍟', color: 0xffd700, glow: 0xfff08a, points: 50, positive: true, weight: 1 },
  { type: 'taco', emoji: '🌮', color: 0xffa94d, glow: 0xffd7a3, points: 50, positive: true, weight: 1 },
  { type: 'bebida', emoji: '🥤', color: 0x30c5e8, glow: 0x9be4f5, points: 50, positive: true, weight: 1 },
  { type: 'nuggets', emoji: '🍗', color: 0xf7bb88, glow: 0xffdcc0, points: 50, positive: true, weight: 1 },

  // Lo que NO se debe cortar. Todos llevan anillo de peligro a rayas, así se
  // distinguen de un vistazo aunque el jugador no alcance a ver el ícono.
  { type: 'bomba', emoji: '💣', color: 0x201025, glow: 0xff2d2d, points: 0, positive: false, endsGame: true, weight: 1.2, scale: 1.18 },
  { type: 'basura', emoji: '🗑️', color: 0x3f4653, glow: 0x8b93a1, points: -100, positive: false, weight: 1 },
  { type: 'pescado', emoji: '🐟', color: 0x2b5f8f, glow: 0x7fb3dd, points: -75, positive: false, weight: 1 },
  { type: 'mala_burger', emoji: '🤢', color: 0x51701a, glow: 0xa3c74a, points: -50, positive: false, weight: 1 },
];

export const GAME = {
  /** Debe coincidir con GAME_DURATION_SECONDS del servidor. */
  duration: 45,
  /** Radio base del elemento. El ícono ocupa ~1.3 veces este radio. */
  itemRadius: 44,
  /** Tamaño del emoji dentro del círculo, en px. */
  emojiSize: 54,
  gravity: 900,
  /** Probabilidad de que el elemento que sale sea negativo. */
  negativeChance: 0.28,
  /** Ritmo de aparición (ms) por tramo de la partida. */
  spawnPhases: [
    { atSecond: 0, delay: 650, maxBurst: 1 },
    { atSecond: 15, delay: 460, maxBurst: 2 },
    { atSecond: 30, delay: 330, maxBurst: 2 },
    { atSecond: 40, delay: 260, maxBurst: 3 },
  ],
  combo: {
    resetMs: 1400,
    tiers: [
      { min: 10, multiplier: 3 },
      { min: 5, multiplier: 2 },
      { min: 3, multiplier: 1.5 },
    ],
  },
  colors: {
    bg: 0x1e0a3c,
    bgDeep: 0x0d0520,
    primary: 0xf5c518,
    danger: 0xff4444,
  },
};

/**
 * El servidor manda: si algún día cambias GAME_DURATION_SECONDS en el backend,
 * el juego se ajusta solo al entrar y no hay partidas rechazadas por duración.
 */
export function setGameDuration(seconds: number) {
  if (Number.isFinite(seconds) && seconds >= 10 && seconds <= 300) {
    GAME.duration = seconds;
  }
}

export function multiplierFor(combo: number): number {
  for (const tier of GAME.combo.tiers) if (combo >= tier.min) return tier.multiplier;
  return 1;
}
