/**
 * Catálogo por defecto de premios.
 *
 * Reglas del negocio (editables desde el panel admin, esto es solo la semilla):
 *   - priority 1 = mejor premio. El orden manda en la cascada de stock.
 *   - minScore   = puntaje mínimo para aspirar a ese premio.
 *   - dailyStock = unidades disponibles CADA día. null = ilimitado (consolación).
 *
 * Stock diario acordado:
 *   1 hamburguesa · 2 bebidas · 3 domicilios · 5 cupones de 30% · 5% ilimitado
 */
export interface PrizeSeed {
  key: string;
  label: string;
  emoji: string;
  priority: number;
  minScore: number;
  dailyStock: number | null;
  whatsappTemplate: string;
}

export const DEFAULT_PRIZES: PrizeSeed[] = [
  {
    key: 'free_burger',
    label: 'Hamburguesa gratis',
    emoji: '🍔',
    priority: 1,
    minScore: 2000,
    dailyStock: 1,
    whatsappTemplate:
      '🍔 ¡Hola! Hice {score} puntos en Mala Vida Fast Food y gané una *Hamburguesa gratis*. Mi código es *{code}*.',
  },
  {
    key: 'free_drink',
    label: 'Bebida gratis',
    emoji: '🥤',
    priority: 2,
    minScore: 1400,
    dailyStock: 2,
    whatsappTemplate:
      '🥤 ¡Hola! Hice {score} puntos en Mala Vida Fast Food y gané una *Bebida gratis*. Mi código es *{code}*.',
  },
  {
    key: 'free_delivery',
    label: 'Domicilio gratis',
    emoji: '🛵',
    priority: 3,
    minScore: 900,
    dailyStock: 3,
    whatsappTemplate:
      '🛵 ¡Hola! Hice {score} puntos en Mala Vida Fast Food y gané un *Domicilio gratis*. Mi código es *{code}*.',
  },
  {
    key: 'discount_30',
    label: '30% de descuento',
    emoji: '💫',
    priority: 4,
    minScore: 400,
    dailyStock: 5,
    whatsappTemplate:
      '💫 ¡Hola! Hice {score} puntos en Mala Vida Fast Food y gané un *30% de descuento*. Mi código es *{code}*.',
  },
  {
    key: 'discount_5',
    label: '5% de descuento',
    emoji: '🏷️',
    priority: 5,
    minScore: 0,
    dailyStock: null, // consolación: siempre hay
    whatsappTemplate:
      '🏷️ ¡Hola! Hice {score} puntos en Mala Vida Fast Food y gané un *5% de descuento*. Mi código es *{code}*.',
  },
];

/** Premios extra por racha de días consecutivos. */
export interface StreakRewardSeed {
  day: number;
  label: string;
  emoji: string;
}

export const STREAK_REWARDS: StreakRewardSeed[] = [
  { day: 1, label: '5% adicional', emoji: '🔥' },
  { day: 2, label: '15% adicional', emoji: '🔥' },
  { day: 3, label: '50% adicional', emoji: '🔥' },
  { day: 4, label: 'Bebida gratis', emoji: '🥤' },
  { day: 5, label: 'Premio según tu promedio de 5 días', emoji: '🏆' },
];

export function renderTemplate(
  template: string,
  vars: { score: number; code: string; label: string; phone?: string },
): string {
  return template
    .replaceAll('{score}', vars.score.toLocaleString('es-CO'))
    .replaceAll('{code}', vars.code)
    .replaceAll('{label}', vars.label)
    .replaceAll('{phone}', vars.phone ?? '');
}
