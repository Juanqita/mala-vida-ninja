import { Router } from 'express';
import { env } from '../env.js';
import { todayInTz } from '../lib/time.js';
import authRouter from './auth.js';
import gameRouter from './game.js';
import playerRouter from './player.js';
import publicRouter from './public.js';
import adminRouter from './admin.js';

const router: Router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    today: todayInTz(),
    timezone: env.TIMEZONE,
    env: env.NODE_ENV,
    gameDurationSeconds: env.GAME_DURATION_SECONDS,
  });
});

router.use(authRouter);
router.use(gameRouter);
router.use(playerRouter);
router.use(publicRouter);
router.use(adminRouter);

export default router;
