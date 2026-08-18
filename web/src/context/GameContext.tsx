import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StreakInfo, SubmitResponse } from '@/lib/api';

export interface GameEndData {
  score: number;
  comboMax: number;
  durationSeconds: number;
  itemsCut: number;
  bombsHit: number;
  endedByBomb: boolean;
}

interface AuthState {
  token: string | null;
  playerId: string | null;
  phone: string | null;
  streak: StreakInfo | null;
  gameDurationSeconds: number;
}

const DEFAULT_AUTH: AuthState = {
  token: null,
  playerId: null,
  phone: null,
  streak: null,
  gameDurationSeconds: 45,
};

interface Ctx {
  auth: AuthState;
  setAuth: (a: AuthState) => void;
  gameEnd: GameEndData | null;
  setGameEnd: (d: GameEndData | null) => void;
  result: SubmitResponse | null;
  setResult: (r: SubmitResponse | null) => void;
  reset: () => void;
}

const GameContext = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH);
  const [gameEnd, setGameEnd] = useState<GameEndData | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const value = useMemo<Ctx>(
    () => ({
      auth,
      setAuth,
      gameEnd,
      setGameEnd,
      result,
      setResult,
      reset: () => {
        setAuth(DEFAULT_AUTH);
        setGameEnd(null);
        setResult(null);
      },
    }),
    [auth, gameEnd, result],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): Ctx {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame debe usarse dentro de <GameProvider>');
  return ctx;
}

export const DEFAULT_AUTH_STATE = DEFAULT_AUTH;
