import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// El .env puede estar en la raíz del proyecto o dentro de server/: buscamos en
// los dos, porque npm ejecuta los scripts con el cwd en server/ y a nadie le
// gusta tener que duplicar el archivo de configuración.
const here = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(here, '../.env'),
  path.resolve(here, '../../.env'),
  path.resolve(here, '../../../.env'),
]) {
  dotenv.config({ path: candidate, override: false });
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`La variable ${name} debe ser un número`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProd = NODE_ENV === 'production';

// Error típico al arrancar por primera vez: copiar .env.example y no editarlo.
// Mejor decirlo claro que dejar que falle con un "ENOTFOUND host".
const rawDbUrl = process.env.DATABASE_URL ?? '';
if (/usuario:password@host/.test(rawDbUrl) || rawDbUrl === '') {
  throw new Error(
    'DATABASE_URL sigue con el valor de ejemplo. Abre el archivo .env y pon la URL real de tu base de datos ' +
      '(la de Neon/Supabase, o postgres://postgres:postgres@localhost:5432/mala_vida si usas Docker).',
  );
}

export const env = {
  NODE_ENV,
  isProd,
  PORT: int('PORT', 8080),
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_SSL: bool('DATABASE_SSL', false),
  SESSION_SECRET: required(
    'SESSION_SECRET',
    isProd ? undefined : 'dev-secret-no-usar-en-produccion',
  ),
  ADMIN_KEY: required('ADMIN_KEY', isProd ? undefined : 'admin123'),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER ?? '573134966423',
  TIMEZONE: process.env.TIMEZONE ?? 'America/Bogota',
  GAME_DURATION_SECONDS: int('GAME_DURATION_SECONDS', 45),
  REWARD_VALID_HOURS: int('REWARD_VALID_HOURS', 48),
  GAMES_PER_DAY: int('GAMES_PER_DAY', 1),
} as const;
