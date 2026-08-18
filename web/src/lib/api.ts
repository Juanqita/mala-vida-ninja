/**
 * Cliente HTTP tipado. Todas las respuestas del backend pasan por aquí.
 *
 * VITE_API_URL permite alojar el juego en un sitio estático (GitHub Pages) y el
 * backend en otro (Render/Railway). Si no se define, se asume mismo origen.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(status: number, data: any) {
    super(data?.error ?? `Error ${status}`);
    this.status = status;
    this.code = data?.code;
    this.data = data;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

// ─── Tipos compartidos con el backend ────────────────────────────────────────

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
  nextStreakDay: number;
  nextRewardLabel: string;
  todayRewardLabel: string | null;
}

export interface RewardView {
  prizeKey: string;
  label: string;
  emoji: string;
  code: string;
  status?: string;
  validUntil: string;
  whatsappUrl: string;
  downgraded?: boolean;
  deservedKey?: string | null;
}

export interface LoginResponse {
  alreadyPlayedToday: boolean;
  message?: string;
  token?: string;
  player?: { id: string; phone: string };
  streak: StreakInfo;
  gameDurationSeconds?: number;
  prizesToday?: { label: string; emoji: string; remaining: number | null }[];
  todayScore?: number | null;
  todayReward?: RewardView | null;
}

export interface SubmitResponse {
  finalScore: number;
  reward: RewardView;
  streakReward: { label: string; emoji: string; code: string; whatsappUrl: string } | null;
  streak: StreakInfo;
}

export interface SubmitPayload {
  token: string;
  score: number;
  comboMax: number;
  durationSeconds: number;
  itemsCut: number;
  bombsHit: number;
  endedByBomb: boolean;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  login: (phone: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  submitGame: (payload: SubmitPayload) =>
    request<SubmitResponse>('/game/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  prizesToday: () =>
    request<{
      date: string;
      prizes: { label: string; emoji: string; minScore: number; remaining: number | null; unlimited: boolean }[];
    }>('/prizes/today'),

  leaderboard: (scope: 'today' | 'all' = 'today') =>
    request<{
      scope: string;
      entries: { rank: number; phoneMasked: string; bestScore: number; plays: number }[];
    }>(`/leaderboard?scope=${scope}`),
};
