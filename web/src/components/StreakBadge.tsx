import { motion } from 'framer-motion';
import type { StreakInfo } from '@/lib/api';

const DAYS = [1, 2, 3, 4, 5];

export default function StreakBadge({ streak, compact = false }: { streak: StreakInfo; compact?: boolean }) {
  const done = Math.min(streak.currentStreak, 5);
  const progress = (done / 5) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full card-glass rounded-2xl p-5"
    >
      {!compact && (
        <p className="font-display text-2xl text-white mb-3 tracking-wide">Racha actual</p>
      )}

      <div className="flex gap-2 mb-3">
        {DAYS.map((day) => {
          const active = day <= done;
          return (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <motion.div
                animate={active ? { scale: [1, 1.18, 1.1] } : { scale: 1 }}
                transition={{ duration: 0.4, delay: day * 0.06 }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                style={{
                  background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                  boxShadow: active ? '0 6px 20px rgba(245,197,24,0.45)' : 'none',
                }}
              >
                {active ? '🔥' : '⚪'}
              </motion.div>
              <span className="text-[10px] text-white/60 font-bold">{day}</span>
            </div>
          );
        })}
      </div>

      {/* Barra de progreso de la racha */}
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#F5C518,#FF8C42)' }}
        />
      </div>

      {streak.currentStreak > 0 ? (
        <p className="text-sm text-[color:var(--color-primary)] font-bold">
          Día {streak.currentStreak} — Siguiente premio: {streak.nextRewardLabel}
        </p>
      ) : (
        <p className="text-sm text-white/60">
          Juega hoy y empieza tu racha. Primer premio: {streak.nextRewardLabel}
        </p>
      )}
    </motion.div>
  );
}
