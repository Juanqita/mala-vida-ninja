import 'dotenv/config';

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
