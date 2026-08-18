import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Blobs, Logo } from '@/components/Brand';
import StreakBadge from '@/components/StreakBadge';
import { useGame } from '@/context/GameContext';
import { api, ApiError, type SubmitResponse } from '@/lib/api';

export default function ResultPage() {
  const [, navigate] = useLocation();
  const { auth, gameEnd, result, setResult } = useGame();
  const [status, setStatus] = useState<'sending' | 'done' | 'error'>('sending');
  const [errorMsg, setErrorMsg] = useState('');
  const sent = useRef(false);

  useEffect(() => {
    if (!auth.token || !gameEnd) {
      navigate('/');
      return;
    }
    if (sent.current) return;
    sent.current = true;

    api
      .submitGame({
        token: auth.token,
        score: gameEnd.score,
        comboMax: gameEnd.comboMax,
        durationSeconds: gameEnd.durationSeconds,
        itemsCut: gameEnd.itemsCut,
        bombsHit: gameEnd.bombsHit,
        endedByBomb: gameEnd.endedByBomb,
      })
      .then((res: SubmitResponse) => {
        setResult(res);
        setStatus('done');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : 'No pudimos guardar tu puntaje. Revisa tu internet.',
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const score = result?.finalScore ?? gameEnd?.score ?? 0;
  const reward = result?.reward;
  const streak = result?.streak ?? auth.streak;

  return (
    <div className="screen-bg w-full flex flex-col items-center justify-start relative overflow-hidden">
      <Blobs />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center px-5 pt-8 pb-10 gap-5">
        <Logo size="sm" />

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
          className="text-center"
        >
          <p className="text-white/60 font-bold text-sm tracking-[0.25em] uppercase mb-1">Puntaje final</p>
          <p
            className="font-display text-8xl text-[color:var(--color-primary)] leading-none"
            style={{ textShadow: '0 0 40px rgba(245,197,24,0.6)' }}
          >
            {score.toLocaleString('es-CO')}
          </p>
        </motion.div>

        {gameEnd && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex gap-3 w-full justify-center"
          >
            {[
              { label: 'Cortes', value: gameEnd.itemsCut },
              { label: 'Combo máx', value: `x${gameEnd.comboMax}` },
              { label: 'Tiempo', value: `${gameEnd.durationSeconds}s` },
            ].map((stat) => (
              <div key={stat.label} className="flex-1 card-glass rounded-xl py-3 px-2 text-center">
                <p className="font-display text-2xl text-white">{stat.value}</p>
                <p className="text-white/50 text-xs font-bold mt-0.5">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Premio */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="w-full rounded-2xl border-2 p-5 text-center"
          style={{ borderColor: 'rgba(245,197,24,0.6)', background: 'rgba(245,197,24,0.08)' }}
        >
          {status === 'sending' && (
            <p className="text-white/60 text-sm font-bold animate-pulse py-4">Calculando tu premio...</p>
          )}

          {status === 'error' && (
            <>
              <div className="text-4xl mb-2">😕</div>
              <p className="text-white/80 text-sm font-bold">{errorMsg}</p>
              <p className="text-white/50 text-xs mt-2">
                Tu puntaje fue {score.toLocaleString('es-CO')}. Escríbenos por WhatsApp si crees que hubo un error.
              </p>
            </>
          )}

          {status === 'done' && reward && (
            <>
              <motion.div
                initial={{ scale: 0.4, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 12 }}
                className="text-5xl mb-2"
              >
                {reward.emoji}
              </motion.div>
              <p className="text-white/60 text-xs uppercase tracking-widest font-bold mb-1">Tu premio</p>
              <p className="font-display text-3xl text-[color:var(--color-primary)] tracking-wide">
                {reward.label}
              </p>
              <p className="font-mono text-base text-white mt-2 tracking-[0.2em] bg-black/30 rounded-lg py-2">
                {reward.code}
              </p>
              <p className="text-white/40 text-[11px] mt-2">
                Muestra este código en el local. Vence el{' '}
                {new Date(reward.validUntil).toLocaleString('es-CO', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
                .
              </p>
              {reward.downgraded && (
                <p className="text-[color:var(--color-accent)] text-xs mt-3 font-bold">
                  Los premios mayores de hoy ya se agotaron. ¡Vuelve mañana temprano!
                </p>
              )}
            </>
          )}
        </motion.div>

        {/* Premio extra por racha */}
        {result?.streakReward && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
            className="w-full card-glass rounded-2xl p-4 text-center"
          >
            <p className="text-white/60 text-xs uppercase tracking-widest font-bold">Bono por racha</p>
            <p className="font-display text-2xl text-white mt-1">
              {result.streakReward.emoji} {result.streakReward.label}
            </p>
            <p className="font-mono text-sm text-white/80 mt-1 tracking-widest">{result.streakReward.code}</p>
          </motion.div>
        )}

        {streak && <StreakBadge streak={streak} />}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full flex flex-col gap-3"
        >
          <a
            href={reward?.whatsappUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full font-display text-2xl tracking-widest py-4 rounded-2xl text-center shadow-xl block"
            style={{
              background: 'var(--color-whatsapp)',
              color: '#fff',
              boxShadow: '0 6px 24px rgba(37,211,102,0.4)',
              opacity: reward ? 1 : 0.5,
              pointerEvents: reward ? 'auto' : 'none',
            }}
          >
            Reclamar por WhatsApp
          </a>

          <button
            onClick={() => navigate('/')}
            className="w-full card-glass text-white font-display text-xl tracking-widest py-4 rounded-2xl"
          >
            Volver al inicio
          </button>
        </motion.div>
      </div>
    </div>
  );
}
