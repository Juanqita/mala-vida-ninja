import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface PlayerToken {
  playerId: string;
  phone: string;
  sessionId: string;
  playDate: string;
  iat?: number;
  exp?: number;
}

export function signPlayerToken(payload: Omit<PlayerToken, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.SESSION_SECRET, { expiresIn: '6h' });
}

export function verifyPlayerToken(token: string): PlayerToken {
  return jwt.verify(token, env.SESSION_SECRET) as PlayerToken;
}

export function tokenFromRequest(header?: string, bodyToken?: string): string | null {
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (bodyToken) return bodyToken;
  return null;
}
