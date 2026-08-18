import { env } from '../env.js';

/**
 * Todo el juego razona en días de la zona horaria del restaurante
 * (por defecto America/Bogota), no en UTC. Si usáramos UTC, el "día" se
 * reiniciaría a las 7:00 p.m. hora Colombia y un jugador podría jugar dos veces.
 */
export function todayInTz(tz: string = env.TIMEZONE, at: Date = new Date()): string {
  // en-CA produce YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function yesterdayOf(isoDate: string): string {
  return addDays(isoDate, -1);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Hora local legible del restaurante, para el panel admin. */
export function formatLocal(dt: Date, tz: string = env.TIMEZONE): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(dt);
}
