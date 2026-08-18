import { randomInt } from 'node:crypto';

// Sin 0/O/1/I para que nadie dicte mal un código por WhatsApp.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRewardCode(prefix = 'MV'): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += CHARS[randomInt(CHARS.length)];
  return `${prefix}-${suffix}`;
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()./]/g, '').replace(/^00/, '+');
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{6,18}$/.test(normalizePhone(phone));
}

export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}
