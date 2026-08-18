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
}

export const ITEMS: ItemConfig[] = [
  // Productos del restaurante (suman)
  { type: 'hamburguesa', emoji: '🍔', color: 0xff6b35, glow: 0xff8c5a, points: 50, positive: true, weight: 1 },
  { type: 'papas', emoji: '🍟', color: 0xffd700, glow: 0xffe533, points: 50, positive: true, weight: 1 },
  { type: 'taco', emoji: '🌮', color: 0xff8c42, glow: 0xffa966, points: 50, positive: true, weight: 1 },
  { type: 'bebida', emoji: '🥤', color: 0x00b4d8, glow: 0x33c9e8, points: 50, positive: true, weight: 1 },
  { type: 'nuggets', emoji: '🍗', color: 0xf4a261, glow: 0xf7bb88, points: 50, positive: true, weight: 1 },

  // Lo que no se debe cortar (resta o termina la partida)
  { type: 'bomba', emoji: '💣', color: 0x1a1a2e, glow: 0xff0000, points: 0, positive: false, endsGame: true, weight: 1.1 },
  { type: 'basura', emoji: '🗑️', color: 0x4b5563, glow: 0x6b7280, points: -100, positive: false, weight: 1 },
  { type: 'pescado', emoji: '🐟', color: 0x3b82f6, glow: 0x60a5fa, points: -75, positive: false, weight: 1 },
  { type: 'mala_burger', emoji: '🤢', color: 0x4d7c0f, glow: 0x65a30d, points: -50, positive: false, weight: 1 },
];

export const GAME = {
  /** Debe coincidir con GAME_DURATION_SECONDS del servidor. */
  duration: 45,
  itemRadius: 36,
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
