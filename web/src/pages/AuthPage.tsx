import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Blobs, Logo } from '@/components/Brand';
import StreakBadge from '@/components/StreakBadge';
import { useGame } from '@/context/GameContext';
import { api, ApiError, type LoginResponse, type RewardView, type StreakInfo } from '@/lib/api';

function PrizeTeaser({
  prizes,
}: {
  prizes: { label: string; emoji: string; remaining: number | null }[];
}) {
  const left = prizes.filter((p) => p.remaining !== null && p.remaining > 0);
  if (left.length === 0) return null;

  return (
    <div className="w-full card-glass rounded-2xl px-4 py-3">
      <p className="text-white/60 text-[11px] uppercase tracking-[0.2em] font-bold mb-2">
        Premios que quedan hoy
      </p>
      <div className="flex flex-wrap gap-2">
        {left.map((p) => (
          <span
            key={p.label}
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10"
          >
            {p.emoji} {p.label} · {p.remaining}
          </span>
        ))}
      </div>
    </div>
  );
}

function AlreadyPlayed({
  streak,
  reward,
  score,
}: {
  streak: StreakInfo;
  reward: RewardView | null;
  score: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl">
        ⏰
      </motion.div>

      <div className="text-center">
        <h2 className="font-display text-4xl text-[color:var(--color-primary)] tracking-widest mb-2">
          Ya jugaste hoy
        </h2>
        <p className="text-white/70 text-sm leading-relaxed">
          Solo una partida por día. Reclama tu premio o vuelve mañana.
        </p>
        {score !== null && (
          <p className="text-white/50 text-xs mt-2">
            Tu puntaje de hoy: <span className="text-white font-bold">{score.toLocaleString('es-CO')}</span>
          </p>
        )}
      </div>

      {reward && (
        <div
          className="w-full rounded-2xl border-2 p-4 text-center"
          style={{ borderColor: 'rgba(245,197,24,0.5)', background: 'rgba(245,197,24,0.08)' }}
        >
          <div className="text-4xl mb-1">{reward.emoji}</div>
          <p className="font-display text-2xl text-[color:var(--color-primary)]">{reward.label}</p>
          <p className="font-mono text-sm text-white/80 mt-1 tracking-widest">{reward.code}</p>
          <p className="text-white/40 text-[11px] mt-1">
            {reward.status === 'claimed' ? 'Ya reclamado' : 'Muestra este código en el local'}
          </p>
        </div>
      )}

      <StreakBadge streak={streak} />

      <a
        href={reward?.whatsappUrl ?? 'https://wa.me/'}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full font-display text-2xl tracking-widest py-4 rounded-2xl text-center shadow-lg"
        style={{ background: 'var(--color-whatsapp)', color: '#fff' }}
      >
        Reclamar por WhatsApp
      </a>
    </div>
  );
}

export default function AuthPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { setAuth, reset } = useGame();

  const prefilled = new URLSearchParams(search).get('phone') ?? '';
  const [phone, setPhone] = useState(prefilled);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<'form' | 'ready' | 'played'>('form');
  const [data, setData] = useState<LoginResponse | null>(null);
  const [prizes, setPrizes] = useState<{ label: string; emoji: string; remaining: number | null }[]>([]);

  useEffect(() => {
    reset();
    api
      .prizesToday()
      .then((r) => setPrizes(r.prizes.filter((p) => !p.unlimited)))
      .catch(() => setPrizes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validPhone(value: string) {
    return /^\+?[1-9]\d{6,18}$/.test(value.replace(/[\s\-()]/g, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cleaned = phone.trim();

    if (!validPhone(cleaned)) {
      setError('Escribe tu número con indicativo, ej: +57 300 123 4567');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(cleaned);
      setData(res);

      if (res.alreadyPlayedToday) {
        setState('played');
      } else {
        setAuth({
          token: res.token ?? null,
          playerId: res.player?.id ?? null,
          phone: res.player?.phone ?? cleaned,
          streak: res.streak,
          gameDurationSeconds: res.gameDurationSeconds ?? 45,
        });
        setState('ready');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError(err.message);
      else if (err instanceof ApiError && err.status === 400) setError(err.message);
      else if (err instanceof ApiError && err.status === 429) setError('Muchos intentos. Espera un minuto.');
      else setError('No pudimos conectar. Revisa tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen-bg w-full flex flex-col items-center justify-start relative overflow-hidden">
      <Blobs />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center px-5 pt-10 pb-10 gap-6">
        <Logo />

        <AnimatePresence mode="wait">
          {state === 'played' && data ? (
            <motion.div
              key="played"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="w-full"
            >
              <AlreadyPlayed
                streak={data.streak}
                reward={data.todayReward ?? null}
                score={data.todayScore ?? null}
              />
            </motion.div>
          ) : state === 'ready' && data ? (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-5"
            >
              <StreakBadge streak={data.streak} />
              <PrizeTeaser prizes={data.prizesToday ?? prizes} />
              <p className="text-white/70 text-sm text-center">
                Tienes {data.gameDurationSeconds ?? 45} segundos. Corta la comida, esquiva las bombas.
              </p>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate('/game')}
                className="btn-primary w-full font-display text-4xl tracking-widest py-5 rounded-2xl"
              >
                JUGAR
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full flex flex-col gap-4"
            >
              <div className="text-center mb-1">
                <p className="font-display text-2xl text-white tracking-wide">
                  Ingresa tu número de WhatsApp
                </p>
                <p className="text-white/50 text-xs mt-1">para guardar tu puntaje y reclamar premios</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError('');
                  }}
                  placeholder="+57 300 123 4567"
                  disabled={loading}
                  className="w-full bg-white/10 border border-white/25 rounded-xl px-4 py-4 text-white text-lg font-bold placeholder:text-white/30 focus:outline-none focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-primary)]/40 transition-all"
                />

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-red-400 text-sm font-bold px-1"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={loading || !phone.trim()}
                  whileTap={{ scale: 0.97 }}
                  className="btn-primary w-full font-display text-3xl tracking-widest py-4 rounded-2xl transition-opacity"
                >
                  {loading ? 'Verificando...' : 'ENTRAR'}
                </motion.button>
              </form>

              <PrizeTeaser prizes={prizes} />

              <p className="text-center text-white/40 text-xs leading-relaxed">
                Una partida por día. Tu número solo se usa para guardar tu puntaje.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
